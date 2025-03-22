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
    sendPlayerMovement: function(position, rotation) {
        socket.emit('player-movement', { 
            position: { x: position.x, y: position.y, z: position.z },
            rotation: { x: rotation.x, y: rotation.y, z: rotation.z }
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
async function startGame(){
    try {
        let result = await BABYLON.SceneLoader.ImportMeshAsync("", "assets/", "player.glb", scene);
        playerModel = result.meshes[0];
        playerModel.isVisible = false;
        playerModel.scaling = new BABYLON.Vector3(1, 1, 1);

        // Store original animations
        result.animationGroups.forEach(ag => {
            originalAnimations.push(ag);
            ag.stop(); // Stop original animations
        });

        assetsLoaded = true;
        console.log("Model and animations loaded successfully.");
    } catch (error) {
        console.error("Error loading model:", error);
    }
}

// Function to create and clone the model for a remote player
function createRemotePlayer(playerId, position) {
    if (!assetsLoaded) return;

    let clonedModel = playerModel.clone("player_" + playerId);
    clonedModel.position.copyFrom(position);
    clonedModel.isVisible = true;

    // Clone animation groups for this player
    const clonedAnimations = {};
    originalAnimations.forEach(ag => {
        const clonedAG = ag.clone(`player_${playerId}_${ag.name}`, (target) => {
            // Find the corresponding node in the cloned model
            return clonedModel.getChildTransformNodes(true).find(n => n.name === target.name);
        });
        clonedAnimations[ag.name.toLowerCase()] = clonedAG;
    });

    // Initialize with idle animation
    if (clonedAnimations["idle"]) {
        clonedAnimations["idle"].start(true);
        console.log(`Started idle animation for player ${playerId}`);
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

        // Determine animation
        const movementDelta = newPos.subtract(remote.startPosition);
        const animationToPlay = movementDelta.length() > 0.1 ? 
            getMovementAnimation(movementDelta.normalize()) : "idle";

        if (remote.currentAnimation !== animationToPlay) {
            console.log(`Changing animation for player ${data.id} to ${animationToPlay}`);
            Object.values(remote.animations).forEach(anim => anim.stop());
            if (remote.animations[animationToPlay]) {
                remote.animations[animationToPlay].start(true);
                remote.currentAnimation = animationToPlay;
            } else {
                console.warn(`Animation ${animationToPlay} not found for player ${data.id}`);
            }
        }
    }
};

function getMovementAnimation(direction) {
    if (Math.abs(direction.z) > Math.abs(direction.x)) {
        return direction.z > 0 ? "run" : "run_back";
    }
    return direction.x > 0 ? "run_right" : "run_left";
}

window.handlePlayerDisconnected = function(data) {
    if (remotePlayers[data.id]) {
        remotePlayers[data.id].model.dispose();
        delete remotePlayers[data.id];
    }
    recentlyDisconnected[data.id] = Date.now();
};

startGame();