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

let remotePlayers = {}; // Store player models here
let recentlyDisconnected = {}; // Track recently disconnected players
let lastUpdate = 0;
const UPDATE_INTERVAL = 100; // Update every 100ms (10 FPS)

// Function to create and return a model for a remote player
function createPlayerModel(playerId, position) {
    return BABYLON.SceneLoader.ImportMeshAsync("", "assets/", "player.glb", scene).then(function(result) {
        let model = result.meshes[0];
        model.scaling = new BABYLON.Vector3(1, 1, 1);
        model.position = position;

        // Assign animations (simplified)
        let anims = {};
        result.animationGroups.forEach(ag => {
            let name = ag.name.toLowerCase();
            if (name.includes("idle")) anims.idle = ag;
            else if (name.includes("walk")) anims.walk = ag;
        });

        if (anims.idle) anims.idle.start(true);

        // Store the model and animations
        remotePlayers[playerId] = {
            model: model,
            animations: anims,
            lastPosition: model.position.clone()
        };

        return model;
    }).catch(function(error) {
        console.error("Error loading model:", error);
    });
}

// Function to handle player movement and animations
window.handleOtherPlayerMovement = function(data) {
    const currentTime = Date.now();
    if (currentTime - lastUpdate < UPDATE_INTERVAL) return;
    lastUpdate = currentTime;

    if (recentlyDisconnected[data.id]) {
        const elapsed = Date.now() - recentlyDisconnected[data.id];
        if (elapsed < 1000) { // Ignore updates within 1 second after disconnection
            return;
        } else {
            delete recentlyDisconnected[data.id];
        }
    }

    if (!remotePlayers[data.id]) {
        // Create and load the model for the new player
        createPlayerModel(data.id, new BABYLON.Vector3(data.movementData.x, data.movementData.y, data.movementData.z));
    } else {
        // Update existing player's position and animations
        let remote = remotePlayers[data.id];
        let model = remote.model;
        model.position.set(data.movementData.x, data.movementData.y, data.movementData.z);
        if (data.rotationData) {
            model.rotation.set(data.rotationData.x, data.rotationData.y, data.rotationData.z);
        }

        let newPos = new BABYLON.Vector3(data.movementData.x, data.movementData.y, data.movementData.z);
        let speed = BABYLON.Vector3.Distance(remote.lastPosition, newPos);
        remote.lastPosition.copyFrom(newPos);

        // If player is moving, start the walk animation, otherwise play idle
        if (speed > 0.1) {
            if (remote.animations.idle && remote.animations.idle.isPlaying) {
                remote.animations.idle.stop();
            }
            if (remote.animations.walk && !remote.animations.walk.isPlaying) {
                remote.animations.walk.start(true);
            }
        } else {
            if (remote.animations.walk && remote.animations.walk.isPlaying) {
                remote.animations.walk.stop();
            }
            if (remote.animations.idle && !remote.animations.idle.isPlaying) {
                remote.animations.idle.start(true);
            }
        }
    }
};

// Function to handle player disconnection
window.handlePlayerDisconnected = function(data) {
    if (remotePlayers[data.id]) {
        // Properly dispose of the model when a player disconnects
        remotePlayers[data.id].model.dispose();
        delete remotePlayers[data.id];
    }
    // Mark the player as recently disconnected to avoid rapid reloading
    recentlyDisconnected[data.id] = Date.now();
};
