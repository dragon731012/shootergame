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
let originalAnimations = []; // Array of { name, animationGroup }
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

        // Store the original animation groups (with their names lowercased)
        result.animationGroups.forEach(ag => {
            let animName = ag.name.toLowerCase();
            originalAnimations.push({ name: animName, animationGroup: ag });
            ag.stop(); // Ensure they are not playing on the base model
        });

        assetsLoaded = true;
    } catch (error) {
        console.error("Error loading model:", error);
    }
}

// Function to create and clone the model for a remote player
function createRemotePlayer(playerId, position) {
    if (!assetsLoaded) return;

    // Clone the player model
    let clonedModel = playerModel.clone("player_" + playerId);
    clonedModel.position.copyFrom(position);
    clonedModel.isVisible = true;
    if (!clonedModel.rotationQuaternion) {
        clonedModel.rotationQuaternion = BABYLON.Quaternion.Identity();
    }

    // Clone each animation group using Babylon's built-in clone() helper.
    // This callback maps the original target to the corresponding node in the clone.
    const clonedAnimations = {};
    originalAnimations.forEach(({ name, animationGroup }) => {
        const clonedAG = animationGroup.clone(
            `player_${playerId}_${name}`,
            (oldTarget) => {
                return clonedModel.getChildTransformNodes(true).find(n => n.name === oldTarget.name) || clonedModel;
            }
        );
        clonedAnimations[name] = clonedAG;
        console.log(`Stored animation: ${name} -> ${clonedAG.name}`);
    });

    // Ensure all animations are stopped before starting idle
    Object.values(clonedAnimations).forEach(ag => ag.stop());

    // Start the idle animation by default (with looping)
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

// Render loop for smooth interpolation of remote players
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

// Movement handler for remote players
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

        // Handle rotation (using yaw based on provided direction)
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
            // Stop all current animations for the player
            Object.values(remote.animations).forEach(anim => anim.stop());

            // Start the new animation if it exists
            if (remote.animations[animationToPlay]) {
                const isLooping = ["idle", "run", "run_back", "run_left", "run_right"].includes(animationToPlay);
                console.log(`Playing animation: ${animationToPlay} for player ${data.id}`);
                remote.animations[animationToPlay].start(true, 1.0, 
                    remote.animations[animationToPlay].from, 
                    remote.animations[animationToPlay].to, 
                    isLooping
                );
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
    // Default to idle if not recognized
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
