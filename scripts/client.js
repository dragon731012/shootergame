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
let playerModel;
let originalAnimations = []; // Store original animation groups
let assetsLoaded = false;

// Function to load the player model once
async function startGame() {
    try {
        let result = await BABYLON.SceneLoader.ImportMeshAsync("", "assets/", "player.glb", scene);
        playerModel = result.meshes[0];
        playerModel.isVisible = false;
        playerModel.scaling = new BABYLON.Vector3(1, 1, 1);
        if (!playerModel.rotationQuaternion) {
            playerModel.rotationQuaternion = BABYLON.Quaternion.Identity();
        }

        // Store original animations with corrected keys (lowercase)
        result.animationGroups.forEach(ag => {
            const baseAnimName = ag.name.toLowerCase();
            originalAnimations.push({ name: baseAnimName, animationGroup: ag });
            ag.stop();
        });

        assetsLoaded = true;
    } catch (error) {
        console.error("Error loading model:", error);
    }
}

// Function to create and clone the model for a remote player
function createRemotePlayer(playerId, position) {
    if (!assetsLoaded) return;

    // Clone the model
    let clonedModel = playerModel.clone("player_" + playerId);
    clonedModel.position.copyFrom(position);
    clonedModel.isVisible = true;
    if (!clonedModel.rotationQuaternion) {
        clonedModel.rotationQuaternion = BABYLON.Quaternion.Identity();
    }

    // Clone the skeleton
    if (playerModel.skeleton) {
        const clonedSkeleton = playerModel.skeleton.clone("clonedSkeleton_" + playerId);
        clonedModel.skeleton = clonedSkeleton;
    }

    // Log all nodes in the cloned model for debugging
    const allNodes = clonedModel.getChildTransformNodes(true);
    console.log("Cloned model nodes:", allNodes.map(node => node.name));

    // Fix node name mismatches
    allNodes.forEach(node => {
        // Example: Rename "WristL_Clone" to "WristL"
        if (node.name.endsWith("_Clone")) {
            node.name = node.name.replace("_Clone", "");
        }
        // Add more renaming logic as needed
    });

    // Clone animations with corrected names
    const clonedAnimations = {};
    originalAnimations.forEach(({ name, animationGroup }) => {
        const clonedAG = new BABYLON.AnimationGroup(`player_${playerId}_${name}`, scene);
        clonedAG.from = animationGroup.from;
        clonedAG.to = animationGroup.to;

        animationGroup.targetedAnimations.forEach(ta => {
            let targetNode;
            // Redirect animations targeting the original root to the cloned root
            if (ta.target === playerModel) {
                targetNode = clonedModel;
            } else {
                targetNode = clonedModel.getChildTransformNodes(true).find(n => n.name === ta.target.name);
            }
            if (targetNode) {
                const clonedAnimation = ta.animation.clone();
                clonedAG.addTargetedAnimation(clonedAnimation, targetNode);
            } else {
                console.error(`Target node ${ta.target.name} not found for animation ${ta.animation.name}`);
            }
        });

        // Store using base name (no player prefix)
        const baseAnimName = name.toLowerCase();
        clonedAnimations[baseAnimName] = clonedAG;
    });

    // Start idle animation by default
    if (clonedAnimations["idle"]) {
        clonedAnimations["idle"].start(true, 1.0, clonedAnimations["idle"].from, clonedAnimations["idle"].to, true);
    }

    remotePlayers[playerId] = {
        model: clonedModel,
        animations: clonedAnimations,
        startPosition: position.clone(),
        targetPosition: position.clone(),
        interpolationStartTime: Date.now(),
        currentAnimation: "idle"
    };
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

        // Handle rotation
        if (data.rotationData) {
            const dir = new BABYLON.Vector3(
                data.rotationData.x,
                data.rotationData.y,
                data.rotationData.z
            );
            const yaw = Math.atan2(dir.x, dir.z);
            remote.model.rotationQuaternion = BABYLON.Quaternion.RotationYawPitchRoll(yaw, 0, 0);
        }

        // Determine which animation to play based on direction
        let animationToPlay = getMovementAnimation(data.direction);
        console.log("Direction:", data.direction, "Animation:", animationToPlay);

        if (remote.currentAnimation !== animationToPlay) {
            // Stop all animations smoothly
            Object.values(remote.animations).forEach(anim => {
                anim.stop();
            });
            // Start the new animation
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
    // If an unexpected direction is received, default to idle.
    return "idle";
}

window.handlePlayerDisconnected = function(data) {
    if (remotePlayers[data.id]) {
        remotePlayers[data.id].model.dispose();
        delete remotePlayers[data.id];
    }
    recentlyDisconnected[data.id] = Date.now();
};

startGame();