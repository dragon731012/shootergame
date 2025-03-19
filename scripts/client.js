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
            // Clear the flag if enough time has passed
            delete recentlyDisconnected[data.id];
        }
    }

    if (!remotePlayers[data.id]) {
        // Create a new mesh for this remote player.
        let remoteMesh = BABYLON.MeshBuilder.CreateSphere("remote_" + data.id, { diameter: 4 }, scene);
        remoteMesh.position = new BABYLON.Vector3(
            data.movementData.x, 
            data.movementData.y, 
            data.movementData.z
        );
        let mat = new BABYLON.StandardMaterial("remoteMat_" + data.id, scene);
        mat.diffuseColor = new BABYLON.Color3(0, 0, 1); // Blue for remote players
        remoteMesh.material = mat;
        remotePlayers[data.id] = remoteMesh;
    } else {
        // Update existing remote player's position and rotation
        let remoteMesh = remotePlayers[data.id];
        remoteMesh.position.x = data.movementData.x;
        remoteMesh.position.y = data.movementData.y;
        remoteMesh.position.z = data.movementData.z;
        if (data.rotationData) {
            remoteMesh.rotation.x = data.rotationData.x;
            remoteMesh.rotation.y = data.rotationData.y;
            remoteMesh.rotation.z = data.rotationData.z;
        }
    }
};

window.handlePlayerDisconnected = function(data) {
    if (remotePlayers[data.id]) {
        remotePlayers[data.id].dispose();
        delete remotePlayers[data.id];
    }
    // Mark the player as recently disconnected with the current timestamp
    recentlyDisconnected[data.id] = Date.now();
};
