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

let remotePlayers = {};  // Store player models here
let recentlyDisconnected = {}; // Track recently disconnected players
let playerModel; // Store the loaded player model for cloning
let lastUpdate = 0;
const UPDATE_INTERVAL = 100; // Update every 100ms (10 FPS)
let assetsLoaded = false; // Ensure the model is loaded before usage
let animations = {}; // Store animations
let interpolationBuffer = {}; // Buffer for smooth interpolation

// Function to load the player model once
async function startGame(){
    try {
        let result = await BABYLON.SceneLoader.ImportMeshAsync("", "assets/", "player.glb", scene);
        playerModel = result.meshes[0];
        playerModel.isVisible = false; // Make sure it isn't visible initially
        playerModel.scaling = new BABYLON.Vector3(1, 1, 1); // Scale the model to an appropriate size

        // Assign animations to the model
        result.animationGroups.forEach(ag => {
            animations[ag.name.toLowerCase()] = ag;
        });

        if (animations["idle"]) animations["idle"].start(true);

        assetsLoaded = true;
    } catch (error) {
        console.error("Error loading model:", error);
    }
}

// Function to create and clone the model for a remote player
function createRemotePlayer(playerId, position) {
    if (!assetsLoaded) {
        console.error("Model assets are not loaded yet.");
        return;
    }

    let clonedModel = playerModel.clone("player_" + playerId);
    clonedModel.position = position;
    clonedModel.isVisible = true;

    remotePlayers[playerId] = {
        model: clonedModel,
        animations: animations,
        lastPosition: clonedModel.position.clone(),
        lastRotation: clonedModel.rotationQuaternion.clone(),
        currentAnimation: "idle"
    };

    if (animations["idle"]) {
        animations["idle"].start(true);
    }
}

// Function to handle player movement and animations
window.handleOtherPlayerMovement = function(data) {
    const currentTime = Date.now();
    if (currentTime - lastUpdate < UPDATE_INTERVAL) return;
    lastUpdate = currentTime;

    if (recentlyDisconnected[data.id]) {
        const elapsed = Date.now() - recentlyDisconnected[data.id];
        if (elapsed < 1000) {
            return;
        } else {
            delete recentlyDisconnected[data.id];
        }
    }

    if (!remotePlayers[data.id]) {
        createRemotePlayer(data.id, new BABYLON.Vector3(data.movementData.x, data.movementData.y, data.movementData.z));
    } else {
        let remote = remotePlayers[data.id];
        let model = remote.model;

        // Smooth movement using interpolation
        let newPos = new BABYLON.Vector3(data.movementData.x, data.movementData.y, data.movementData.z);
        let newRotation = data.rotationData ? new BABYLON.Vector3(data.rotationData.x, data.rotationData.y, data.rotationData.z) : remote.lastRotation;

        // Interpolate between the current and new positions
        if (!interpolationBuffer[data.id]) {
            interpolationBuffer[data.id] = {
                startPos: remote.lastPosition.clone(),
                endPos: newPos,
                startTime: currentTime
            };
        } else {
            interpolationBuffer[data.id].endPos = newPos;
            interpolationBuffer[data.id].startTime = currentTime;
        }

        // Interpolate position
        let interpolationData = interpolationBuffer[data.id];
        let progress = (currentTime - interpolationData.startTime) / UPDATE_INTERVAL;
        if (progress > 1) progress = 1; // Cap the progress
        model.position = BABYLON.Vector3.Lerp(interpolationData.startPos, interpolationData.endPos, progress);

        // Interpolate rotation
        let yaw = Math.atan2(newRotation.x, newRotation.z);
        model.rotationQuaternion = BABYLON.Quaternion.RotationYawPitchRoll(yaw, 0, 0);

        // Update remote player data
        remote.lastPosition = model.position.clone();
        remote.lastRotation = model.rotationQuaternion.clone();
        
        let movementDir = new BABYLON.Vector3(newPos.x - remote.lastPosition.x, 0, newPos.z - remote.lastPosition.z).normalize();

        // Determine which animation to play
        let animationToPlay = "idle"; // Default to idle
        if (movementDir.length() > 0.1) {
            // Determine animation based on movement direction
            if (Math.abs(movementDir.z) > Math.abs(movementDir.x)) {
                animationToPlay = movementDir.z > 0 ? "run" : "run_back";
            } else {
                animationToPlay = movementDir.x > 0 ? "run_right" : "run_left";
            }
        }

        // Check if the selected animation is already playing
        if (remote.currentAnimation !== animationToPlay) {
            // Stop the current animation (if any) and start the new one
            Object.values(remote.animations).forEach(anim => anim.stop());
            if (remote.animations[animationToPlay]) {
                remote.animations[animationToPlay].start(true);
                remote.currentAnimation = animationToPlay;
            }
        }
    }
};

// Function to handle player disconnection
window.handlePlayerDisconnected = function(data) {
    if (remotePlayers[data.id]) {
        remotePlayers[data.id].model.dispose();
        delete remotePlayers[data.id];
    }
    recentlyDisconnected[data.id] = Date.now();
};

startGame();
