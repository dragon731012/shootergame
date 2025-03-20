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

let remotePlayers = {};
// Track recently disconnected players with a timestamp
let recentlyDisconnected = {};

window.handleOtherPlayerMovement = function(data) {
    // If this player was recently disconnected, ignore the update for a short period.
    if (recentlyDisconnected[data.id]) {
        const elapsed = Date.now() - recentlyDisconnected[data.id];
        // Ignore updates within 1000ms (1 second) of disconnection
        if (elapsed < 1000) {
            return;
        } else {
            delete recentlyDisconnected[data.id];
        }
    }

    if (!remotePlayers[data.id]) {
        // Load the animated GLB model for this remote player
        BABYLON.SceneLoader.ImportMesh("", "assets/", "player.glb", scene, function(meshes, particleSystems, skeletons, animationGroups) {
            // Assume the main model is the first mesh
            let model = meshes[0];
            model.scaling = new BABYLON.Vector3(0.1, 0.1, 0.1); // Adjust scaling as needed
            model.position = new BABYLON.Vector3(
                data.movementData.x, 
                data.movementData.y, 
                data.movementData.z
            );

            // Organize animations based on keywords (adjust these if needed)
            let anims = {};
            animationGroups.forEach(ag => {
                let name = ag.name.toLowerCase();
                if (name.includes("idle")) {
                    anims.idle = ag;
                } else if (name.includes("walk")) {
                    anims.walk = ag;
                } else if (name.includes("run")) {
                    anims.run = ag;
                }
            });
            
            // Start the idle animation by default
            if (anims.idle) {
                anims.idle.start(true);
            }
            
            // Save remote player info along with a clone of the current position for movement tracking
            remotePlayers[data.id] = {
                model: model,
                animations: anims,
                lastPosition: model.position.clone()
            };
        });
    } else {
        // Update existing remote player's model position and rotation
        let remote = remotePlayers[data.id];
        let model = remote.model;
        model.position.set(data.movementData.x, data.movementData.y, data.movementData.z);
        if (data.rotationData) {
            model.rotation.set(data.rotationData.x, data.rotationData.y, data.rotationData.z);
        }

        // Calculate movement speed to switch animations based on movement
        let newPos = new BABYLON.Vector3(data.movementData.x, data.movementData.y, data.movementData.z);
        let speed = BABYLON.Vector3.Distance(remote.lastPosition, newPos);
        remote.lastPosition.copyFrom(newPos);

        // If moving, play walk animation; otherwise, idle.
        if (speed > 0.1) { // Adjust threshold as needed
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

window.handlePlayerDisconnected = function(data) {
    if (remotePlayers[data.id]) {
        remotePlayers[data.id].model.dispose();
        delete remotePlayers[data.id];
    }
    // Mark the player as recently disconnected with the current timestamp
    recentlyDisconnected[data.id] = Date.now();
};
