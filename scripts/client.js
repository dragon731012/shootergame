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

// Function to load the local player model (if needed for local operations)
async function startGame() {
    try {
        let result = await BABYLON.SceneLoader.ImportMeshAsync("", "assets/", "player.glb", scene);
        // The local player model is stored here if you need it for local use.
        // For remote players we will load new models for each instance.
        console.log("Local player model loaded");
    } catch (error) {
        console.error("Error loading local model:", error);
    }
}

// Function to load a new model for a remote player
function createRemotePlayer(playerId, position) {
    BABYLON.SceneLoader.ImportMeshAsync("", "assets/", "player.glb", scene)
        .then(result => {
            let remoteModel = result.meshes[0];
            remoteModel.position.copyFrom(position);
            remoteModel.isVisible = true;
            if (!remoteModel.rotationQuaternion) {
                remoteModel.rotationQuaternion = BABYLON.Quaternion.Identity();
            }

            // Process animations for the remote player model
            let remoteAnimations = {};
            result.animationGroups.forEach(ag => {
                const animName = ag.name.toLowerCase();
                // Create a new animation group for this remote player
                let newAnimGroup = new BABYLON.AnimationGroup(`player_${playerId}_${animName}`, scene);
                newAnimGroup.from = ag.from;
                newAnimGroup.to = ag.to;

                ag.targetedAnimations.forEach(ta => {
                    let targetNode;
                    // If the animation targets the root, set it to the remote model
                    if (ta.target === result.meshes[0]) {
                        targetNode = remoteModel;
                    } else {
                        targetNode = remoteModel.getChildTransformNodes(true).find(n => n.name === ta.target.name);
                    }
                    if (targetNode) {
                        const clonedAnimation = ta.animation.clone();
                        newAnimGroup.addTargetedAnimation(clonedAnimation, targetNode);
                    } else {
                        console.error(`Target node ${ta.target.name} not found for animation ${ta.animation.name}`);
                    }
                });
                remoteAnimations[animName] = newAnimGroup;
            });

            // Start idle animation by default if available
            if (remoteAnimations["idle"]) {
                remoteAnimations["idle"].start(true, 1.0, remoteAnimations["idle"].from, remoteAnimations["idle"].to, true);
            }

            remotePlayers[playerId] = {
                model: remoteModel,
                animations: remoteAnimations,
                startPosition: position.clone(),
                targetPosition: position.clone(),
                interpolationStartTime: Date.now(),
                currentAnimation: "idle"
            };
        })
        .catch(error => {
            console.error("Error loading remote player model:", error);
        });
}

// Render loop for smooth interpolation
scene.onBeforeRenderObservable.add(() => {
    const now = Date.now();
    for (const playerId in remotePlayers) {
        const remote = remotePlayers[playerId];
        const elapsed = now - remote.interpolationStartTime;
        const t = Math.min(elapsed / 100, 1);
        remote.model.position = BABYLON.Vector3.Lerp(
            remote.startPosition, 
            remote.targetPosition, 
            t
        );
    }
});

// Updated movement handler
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

    if (!remotePlayers[data.id]) {
        createRemotePlayer(data.id, newPos);
    } else {
        const remote = remotePlayers[data.id];
        remote.startPosition.copyFrom(remote.model.position);
        remote.targetPosition.copyFrom(newPos);
        remote.interpolationStartTime = currentTime;
        remote.lastUpdateTime = currentTime;

        // Handle rotation based on provided rotation data
        if (data.rotationData) {
            const dir = new BABYLON.Vector3(
                data.rotationData.x,
                data.rotationData.y,
                data.rotationData.z
            );
            const yaw = Math.atan2(dir.x, dir.z);
            remote.model.rotationQuaternion = BABYLON.Quaternion.RotationYawPitchRoll(yaw, 0, 0);
        }

        // Determine which animation to play based on movement direction
        let animationToPlay = getMovementAnimation(data.direction);
        console.log("Direction:", data.direction, "Animation:", animationToPlay);

        if (remote.currentAnimation !== animationToPlay) {
            // Stop all current animations
            Object.values(remote.animations).forEach(anim => {
                anim.stop();
            });
            // Start the new animation if available
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
    return "idle"; // Default fallback
}

window.handlePlayerDisconnected = function(data) {
    if (remotePlayers[data.id]) {
        remotePlayers[data.id].model.dispose();
        delete remotePlayers[data.id];
    }
    recentlyDisconnected[data.id] = Date.now();
};

startGame();
