// client.js

// Connect to your server (update the URL as needed)
const socket = io('https://server.addmask.com'); // Replace with your actual server domain

// Once connected, log the socket id
socket.on('connect', () => {
    console.log('Connected to server with ID:', socket.id);
});

// Listen for updates from the server (other players moving)
socket.on('playerMoved', (data) => {
    // If a global handler is defined, call it.
    if (window.handleOtherPlayerMovement) {
        window.handleOtherPlayerMovement(data);
    } else {
        console.log(`Player ${data.id} moved:`, data.movementData);
    }
});

// Listen for player disconnect events
socket.on('playerDisconnected', (data) => {
    if (window.handlePlayerDisconnected) {
        window.handlePlayerDisconnected(data);
    }
});

// Expose a network API that your game code can use
window.network = {
    sendPlayerMovement: function(position, rotation) {
        // Send the player's current position and rotation to the server.
        socket.emit('player-movement', { 
            position: { x: position.x, y: position.y, z: position.z },
            rotation: { x: rotation.x, y: rotation.y, z: rotation.z }
        });
    },
    sendShootEvent: function(gunPosition, direction) {
        // Send a shoot event to the server with the gun position and shooting direction.
        socket.emit('shoot', { 
            position: gunPosition, 
            direction: { x: direction.x, y: direction.y, z: direction.z } 
        });
    }
};


let remotePlayers = {};

// Global handler to update remote players when data arrives
window.handleOtherPlayerMovement = function(data) {
    // data: { id, movementData, rotationData }
    if (!remotePlayers[data.id]) {
        // Create a new mesh for this remote player.
        // For example, we'll use a simple sphere (you can replace with your own model).
        let remoteMesh = BABYLON.MeshBuilder.CreateSphere("remote_" + data.id, { diameter: 4 }, scene);
        remoteMesh.position = new BABYLON.Vector3(
            data.movementData.x, 
            data.movementData.y, 
            data.movementData.z
        );
        // Optionally set a distinct material/color
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
            // Assuming rotationData contains Euler angles
            remoteMesh.rotation.x = data.rotationData.x;
            remoteMesh.rotation.y = data.rotationData.y;
            remoteMesh.rotation.z = data.rotationData.z;
        }
    }
};

// Global handler for when a remote player disconnects
window.handlePlayerDisconnected = function(data) {
    if (remotePlayers[data.id]) {
        remotePlayers[data.id].dispose();
        delete remotePlayers[data.id];
    }
};
