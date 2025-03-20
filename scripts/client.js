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
let recentlyDisconnected = {};
let lastUpdate = 0;
const UPDATE_INTERVAL = 100; // Update every 100ms (10 FPS)

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
        BABYLON.SceneLoader.ImportMeshAsync("", "models/", "character.glb", scene).then(function(result) {
            let model = result.meshes[0];
            model.scaling = new BABYLON.Vector3(1, 1, 1);
            model.position = new BABYLON.Vector3(data.movementData.x, data.movementData.y, data.movementData.z);

            // Assign animations (simplified)
            let anims = {};
            result.animationGroups.forEach(ag => {
                let name = ag.name.toLowerCase();
                if (name.includes("idle")) anims.idle = ag;
                else if (name.includes("walk")) anims.walk = ag;
            });

            if (anims.idle) anims.idle.start(true);

            remotePlayers[data.id] = {
                model: model,
                animations: anims,
                lastPosition: model.position.clone()
            };
        }).catch(function(error) {
            console.error("Error loading model:", error);
        });
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

window.handlePlayerDisconnected = function(data) {
    if (remotePlayers[data.id]) {
        remotePlayers[data.id].model.dispose();
        delete remotePlayers[data.id];
    }
    recentlyDisconnected[data.id] = Date.now();
};
