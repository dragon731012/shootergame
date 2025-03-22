const socket = io('https://server.addmask.com'); // Replace with your actual server domain

socket.on('connect', () => {
    console.log('Connected to server with ID:', socket.id);
});

socket.on('playerMoved', (data) => {
    if (window.handleOtherPlayerMovement) {
        window.handleOtherPlayerMovement(data);
    } else {
        console.log(`Player ${data.id} moved:`, data.movementData);
    }
});

socket.on('playerDisconnected', (data) => {
    if (window.handlePlayerDisconnected) {
        window.handlePlayerDisconnected(data);
    }
});

window.network = {
    sendPlayerMovement: function(position, rotation, direction) {
        socket.emit('player-movement', { 
            position: { x: position.x, y: position.y, z: position.z },
            rotation: { x: rotation.x, y: rotation.y, z: rotation.z },
            direction: direction
        });
    },
    sendShootEvent: function(gunPosition, direction) {
        socket.emit('shoot', { 
            position: gunPosition, 
            direction: { x: direction.x, y: direction.y, z: direction.z } 
        });
    }
};

let remotePlayers = {}; 
let recentlyDisconnected = {};

/**
 * Loads a new model for a remote player.
 * A placeholder is stored immediately to prevent concurrent loads.
 */
function createRemotePlayer(playerId, position) {
    // If an entry already exists (even a placeholder), do not create another load.
    if (remotePlayers[playerId]) return;

    // Set a placeholder so that duplicate load calls are ignored.
    remotePlayers[playerId] = { loading: true };

    BABYLON.SceneLoader.ImportMeshAsync("", "assets/", "player.glb", scene)
        .then(result => {
            // Choose the root mesh – adjust this if your glTF uses a different naming convention.
            let remoteModel = result.meshes.find(mesh => mesh.name.toLowerCase() === "player");
            if (!remoteModel) {
                remoteModel = result.meshes[0];
            }
            // Parent all other imported meshes to the chosen root.
            result.meshes.forEach(mesh => {
                if (mesh !== remoteModel) {
                    mesh.parent = remoteModel;
                }
            });

            // Set up basic properties.
            remoteModel.position.copyFrom(position);
            remoteModel.isVisible = true;
            if (!remoteModel.rotationQuaternion) {
                remoteModel.rotationQuaternion = BABYLON.Quaternion.Identity();
            }

            // Build animations for allowed names.
            let allowedAnims = ["idle", "run", "run_back", "run_left", "run_right"];
            let remoteAnimations = {};
            result.animationGroups.forEach(ag => {
                const animName = ag.name.toLowerCase();
                if (!allowedAnims.includes(animName)) return; // Skip unwanted animations

                // Create a new animation group for this remote player.
                let newAnimGroup = new BABYLON.AnimationGroup(`player_${playerId}_${animName}`, scene);
                newAnimGroup.from = ag.from;
                newAnimGroup.to = ag.to;

                ag.targetedAnimations.forEach(ta => {
                    let targetNode;
                    // If the animation targets the original root, use the remote model.
                    if (ta.target === result.meshes[0]) {
                        targetNode = remoteModel;
                    } else {
                        // Search for the node in the remote model's hierarchy.
                        targetNode = remoteModel.getChildTransformNodes(true)
                            .find(n => n.name === ta.target.name);
                    }
                    // Only add the channel if the target exists.
                    if (targetNode) {
                        const clonedAnimation = ta.animation.clone();
                        newAnimGroup.addTargetedAnimation(clonedAnimation, targetNode);
                    }
                });
                remoteAnimations[animName] = newAnimGroup;
            });

            // Start idle animation by default, if available.
            if (remoteAnimations["idle"]) {
                remoteAnimations["idle"].start(true, 1.0, remoteAnimations["idle"].from, remoteAnimations["idle"].to, true);
            }

            // Store the full remote player object.
            remotePlayers[playerId] = {
                model: remoteModel,
                animations: remoteAnimations,
                startPosition: position.clone(),
                targetPosition: position.clone(),
                interpolationStartTime: Date.now(),
                currentAnimation: "idle",
                lastUpdateTime: Date.now()
            };
        })
        .catch(error => {
            console.error("Error loading remote player model:", error);
            delete remotePlayers[playerId]; // Remove placeholder if error occurs.
        });
}

// Render loop for smooth interpolation of remote players.
scene.onBeforeRenderObservable.add(() => {
    const now = Date.now();
    for (const playerId in remotePlayers) {
        const remote = remotePlayers[playerId];
        // Skip if still loading.
        if (remote.loading) continue;
        const elapsed = now - remote.interpolationStartTime;
        const t = Math.min(elapsed / 100, 1);
        remote.model.position = BABYLON.Vector3.Lerp(remote.startPosition, remote.targetPosition, t);
    }
});

/**
 * Handles movement data from other players.
 * Prevents processing data too frequently and creates a new remote player if needed.
 */
window.handleOtherPlayerMovement = function(data) {
    const currentTime = Date.now();
    if (currentTime - (remotePlayers[data.id]?.lastUpdateTime || 0) < 100) return;

    if (recentlyDisconnected[data.id]) {
        if (Date.now() - recentlyDisconnected[data.id] < 1000) return;
        delete recentlyDisconnected[data.id];
    }

    const newPos = new BABYLON.Vector3(
        data.movementData.x,
        data.movementData.y,
        data.movementData.z
    );

    // Create the remote player if it doesn't exist or is still loading.
    if (!remotePlayers[data.id] || remotePlayers[data.id].loading) {
        createRemotePlayer(data.id, newPos);
    } else {
        const remote = remotePlayers[data.id];
        remote.startPosition.copyFrom(remote.model.position);
        remote.targetPosition.copyFrom(newPos);
        remote.interpolationStartTime = currentTime;
        remote.lastUpdateTime = currentTime;

        // Update rotation if provided.
        if (data.rotationData) {
            const dir = new BABYLON.Vector3(
                data.rotationData.x,
                data.rotationData.y,
                data.rotationData.z
            );
            const yaw = Math.atan2(dir.x, dir.z);
            remote.model.rotationQuaternion = BABYLON.Quaternion.RotationYawPitchRoll(yaw, 0, 0);
        }

        // Determine which animation to play.
        let animationToPlay = getMovementAnimation(data.direction);
        if (remote.currentAnimation !== animationToPlay) {
            // Stop all animations.
            Object.values(remote.animations).forEach(anim => anim.stop());
            // Start the new animation if it exists.
            const newAnim = remote.animations[animationToPlay];
            if (newAnim) {
                newAnim.start(true, 1.0, newAnim.from, newAnim.to, true);
                remote.currentAnimation = animationToPlay;
            } else {
                console.warn(`Animation '${animationToPlay}' not found for player ${data.id}. Available:`, Object.keys(remote.animations));
            }
        }
    }
};

function getMovementAnimation(direction) {
    if (direction === "forward" || direction === "forwardleft" || direction === "forwardright") return "run";
    if (direction === "backward" || direction === "backwardleft" || direction === "backwardright") return "run_back";
    if (direction === "left") return "run_left";
    if (direction === "right") return "run_right";
    if (direction === "idle") return "idle";
    return "idle";
}

window.handlePlayerDisconnected = function(data) {
    if (remotePlayers[data.id] && remotePlayers[data.id].model) {
        remotePlayers[data.id].model.dispose();
        delete remotePlayers[data.id];
    }
    recentlyDisconnected[data.id] = Date.now();
};
