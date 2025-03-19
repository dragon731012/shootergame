// Assuming socket.io client is available
const socket = io('https://server.addmask.com');

// Socket Event Handlers

// Send player movement updates to server
function sendMovementData(position) {
    socket.emit('player-movement', { position });
}

// Listen for player updates from the server
socket.on('player-updated', (data) => {
    // Handle server updates to player position or other data
    // For example, update the position of other players
    console.log('Player updated:', data);
});

// Send shooting event to server
document.addEventListener("click", async () => {
    socket.emit('shoot', { position: gun.position, direction: camera.getForwardRay().direction });
});

// Handle gun animations and updates
function updateGunPosition() {
    if (keyMap["w"] && !keyMap["s"] && canJump) {
        gun.rotation = BABYLON.Vector3.Lerp(gun.rotation, new BABYLON.Vector3(0, Math.PI / 2, 0), 0.1);
    }
    if (keyMap["s"] && !keyMap["w"] && canJump) {
        gun.rotation = BABYLON.Vector3.Lerp(gun.rotation, new BABYLON.Vector3(0, Math.PI / 2, 0), 0.1);
    }
    // Add more conditions for other directions and gun adjustments
}

// Regularly update the server with the player’s position
function updatePlayerPosition() {
    const playerPosition = player.position;
    sendMovementData(playerPosition);
}

setInterval(updatePlayerPosition, 100); // Send position every 100ms
