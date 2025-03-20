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
let lastUpdate = 0;
var assetsLoaded = false;
const UPDATE_INTERVAL = 100; // Update every 100ms (10 FPS)

// Function to start the game (modified to use the manual player mesh instead of loading player.glb)
async function startGame(){
    // Instead of loading player.glb, we set assetsLoaded to true.
    assetsLoaded = true;

    // Function to create a remote player using the player mesh from the second code snippet
    function createRemotePlayer(playerId, position) {
        // Create the avatar (cameraHitbox)
        let cameraHitbox = BABYLON.MeshBuilder.CreateSphere("player_" + playerId + "_avatar", {diameter: 1});
        cameraHitbox.position = position;
        cameraHitbox.scaling = new BABYLON.Vector3(0.7, 1.2, 0.7);
        cameraHitbox.checkCollisions = true;

        // Create the head
        let head = BABYLON.MeshBuilder.CreateSphere("player_" + playerId + "_head", {diameter: 1});
        head.scaling = new BABYLON.Vector3(0.3, 0.5, 0.3);
        head.setPivotPoint(new BABYLON.Vector3(0, -0.3, 0));
        head.position = position;
        head.checkCollisions = true;

        // Create the right eye
        let rightEye = BABYLON.MeshBuilder.CreateCylinder("player_" + playerId + "_rightEye", {height: 0.1, diameter: 0.2});
        rightEye.parent = head;
        let eyeMat = new BABYLON.StandardMaterial("player_" + playerId + "_eyeMat", scene);
        eyeMat.diffuseColor = BABYLON.Color3.Black();
        rightEye.material = eyeMat;
        rightEye.position = new BABYLON.Vector3(0.15, 0.2, 0.4);
        rightEye.scaling = new BABYLON.Vector3(0.2, 0.1, 0.2);
        rightEye.rotation = new BABYLON.Vector3(Math.PI / 2, 0, 0);

        // Clone the right eye to create the left eye
        let leftEye = rightEye.clone("player_" + playerId + "_leftEye");
        leftEye.position.x = -rightEye.position.x;

        // If global 'gun' and 'bullet' exist, clone them; otherwise, skip this part.
        let playergun = null;
        let playerbullet = null;
        if (typeof gun !== "undefined" && typeof bullet !== "undefined") {
            playergun = gun.clone("player_" + playerId + "_gun");
            playergun.position = new BABYLON.Vector3(0.5, 0.25, -0.7);
            playergun.setPivotPoint(new BABYLON.Vector3(0, 0.03, 1.65));
            playergun.parent = cameraHitbox;

            playerbullet = bullet.clone("player_" + playerId + "_bullet");
            playerbullet.position = new BABYLON.Vector3(-200.7, 1.62, -200.7);
            playerbullet.parent = playergun;
        }

        // Create right hand
        let rightHand = BABYLON.MeshBuilder.CreateSphere("player_" + playerId + "_rightHand", {diameter: 0.3});
        rightHand.parent = cameraHitbox;
        rightHand.position = new BABYLON.Vector3(-0.8, -0.3, 0.2);

        // Create left hand by cloning right hand
        let leftHand = rightHand.clone("player_" + playerId + "_leftHand");
        leftHand.position = new BABYLON.Vector3(0, 0.03, 1.65);
        leftHand.scaling = new BABYLON.Vector3(0.4, 0.2, 0.3);
        if (playergun) {
            leftHand.parent = playergun;
        }

        remotePlayers[playerId] = {
            model: cameraHitbox,
            head: head,
            gun: playergun,
            bullet: playerbullet,
            lastPosition: BABYLON.Vector3(0,0,0)
        };
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
            // Create and load the model for the new player using the manual player mesh
            createRemotePlayer(data.id, new BABYLON.Vector3(data.movementData.x, data.movementData.y, data.movementData.z));
        } else {
            // Update existing player's position and, if available, rotation
            let remote = remotePlayers[data.id];
            let model = remote.model;
            model.position.set(data.movementData.x, data.movementData.y, data.movementData.z);
            model.rotation.set(data.rotationData.x, data.rotationData.y, data.rotationData.z);
            console.log(data.rotationData);

            let newPos = new BABYLON.Vector3(data.movementData.x, data.movementData.y, data.movementData.z);
            let speed = BABYLON.Vector3.Distance(remote.lastPosition, newPos);
            remote.lastPosition.copyFrom(newPos);

            // Animation handling is omitted since we're using a manually built mesh.
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
}

startGame();
