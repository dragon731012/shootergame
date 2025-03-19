// client.js

// Connect to your server (update the URL as needed)
const socket = io('https://server.addmask.com'); // Replace with your actual server domain

// Once connected, log the socket id
socket.on('connect', () => {
    console.log('Connected to server with ID:', socket.id);
});

// Listen for updates from the server (e.g., other players moving)
// (Your game code can add its own listeners or you can attach callbacks here)
socket.on('playerMoved', (data) => {
    // For example, you might call a function in your game code:
    // window.handleOtherPlayerMovement(data);
    console.log(`Player ${data.id} moved:`, data.movementData);
});

// Expose a network API that your game code can use
window.network = {
    sendPlayerMovement: function(position,rotation) {
        // Send the player's current position to the server.
        // Here, we wrap the position inside an object.
        socket.emit('player-movement', { position: { x: position.x, y: position.y, z: position.z }, rotation: { x: rotation.x, y: rotation.y, z: rotation.z } });
    },
    sendShootEvent: function(gunPosition, direction) {
        // Send a shoot event to the server with the gun position and shooting direction.
        socket.emit('shoot', { position: gunPosition, direction: { x: direction.x, y: direction.y, z: direction.z } });
    }
};
