// client.js

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
        lastPosition: clonedModel.position.clone()
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
        model.position.set(data.movementData.x, data.movementData.y, data.movementData.z);
        if (data.rotationData) {
            model.rotation.set(data.rotationData.x, data.rotationData.y, data.rotationData.z);
        }

        let newPos = new BABYLON.Vector3(data.movementData.x, data.movementData.y, data.movementData.z);
        let speed = BABYLON.Vector3.Distance(remote.lastPosition, newPos);
        remote.lastPosition.copyFrom(newPos);

        // Determine which animation to play
        if (data.action && animations[data.action]) {
            // Only switch animations if the new one isn't already playing
            if (!animations[data.action].isPlaying) {
                Object.values(animations).forEach(anim => anim.stop());
                animations[data.action].start(true);
            }
        } else if (speed > 0.1) {
            if (animations["run"] && !animations["run"].isPlaying) {
                Object.values(animations).forEach(anim => anim.stop());
                animations["run"].start(true);
            }
        } else {
            if (animations["idle"] && !animations["idle"].isPlaying) {
                Object.values(animations).forEach(anim => anim.stop());
                animations["idle"].start(true);
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
