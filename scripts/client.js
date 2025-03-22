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
    sendPlayerMovement: function(position, rotation, direction) {
        socket.emit('player-movement', { 
            position: { x: position.x, y: position.y, z: position.z },
            rotation: { x: rotation.x, y: rotation.y, z: rotation.z },
            direction: direction
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

/**
 * Loads a new model for a remote player.
 * A placeholder is stored immediately to prevent concurrent loads.
 */
function createRemotePlayer(playerId, position) {
    // If an entry already exists (even a placeholder), do not create another load.
    if (remotePlayers[playerId]) return;

    // Set a placeholder so that duplicate load calls are ignored.
    remotePlayers[playerId] = { loading: true };

    BABYLON.SceneLoader.ImportMeshAsync("", "assets/", "player.glb", scene)
        .then(result => {
            let remoteModel=result.meshes[0];
            remoteModel.scaling = new BABYLON.Vector3(1.4, 1.3, 1.4);
            let remoteAnimations={};
            result.animationGroups.forEach(ag => {
                remoteAnimations[ag.name.toLowerCase()] = ag;
            });
    
            if (remoteAnimations["idle"]) remoteAnimations["idle"].start(true);

            remotePlayers[playerId] = {
                model: remoteModel,
                animations: remoteAnimations,
                startPosition: position.clone(),
                targetPosition: position.clone(),
                interpolationStartTime: Date.now(),
                currentAnimation: "idle",
                lastUpdateTime: Date.now()
            };
        })
        .catch(error => {
            console.error("Error loading remote player model:", error);
            delete remotePlayers[playerId]; // Remove placeholder if error occurs.
        });
}


// Render loop for smooth interpolation of remote players.
scene.onBeforeRenderObservable.add(() => {
    const now = Date.now();
    for (const playerId in remotePlayers) {
        const remote = remotePlayers[playerId];
        // Skip if still loading.
        if (remote.loading) continue;
        const elapsed = now - remote.interpolationStartTime;
        const t = Math.min(elapsed / 100, 1);
        remote.model.position = BABYLON.Vector3.Lerp(remote.startPosition, remote.targetPosition, t);
    }
});

/**
 * Handles movement data from other players.
 * Prevents processing data too frequently and creates a new remote player if needed.
 */
window.handleOtherPlayerMovement = function(data) {
    data.movementData.y-=2;

    const currentTime = Date.now();
    if (currentTime - (remotePlayers[data.id]?.lastUpdateTime || 0) < 100) return;

    if (recentlyDisconnected[data.id]) {
        if (Date.now() - recentlyDisconnected[data.id] < 1000) return;
        delete recentlyDisconnected[data.id];
    }

    const newPos = new BABYLON.Vector3(
        data.movementData.x,
        data.movementData.y,
        data.movementData.z
    );

    // Create the remote player if it doesn't exist or is still loading.
    if (!remotePlayers[data.id] || remotePlayers[data.id].loading) {
        createRemotePlayer(data.id, newPos);
    } else {
        const remote = remotePlayers[data.id];
        remote.startPosition.copyFrom(remote.model.position);
        remote.targetPosition.copyFrom(newPos);
        remote.interpolationStartTime = currentTime;
        remote.lastUpdateTime = currentTime;

        // Update rotation if provided.
        if (data.rotationData) {
            const dir = new BABYLON.Vector3(
                data.rotationData.x,
                data.rotationData.y,
                data.rotationData.z
            );
            const yaw = Math.atan2(dir.x, dir.z);
            remote.model.rotationQuaternion = BABYLON.Quaternion.RotationYawPitchRoll(yaw, 0, 0);
        }

        // Determine which animation to play.
        let animationToPlay = getMovementAnimation(data.direction);

        console.log("direction: "+data.direction,"animation:"+animationToPlay);

        if (remote.currentAnimation !== animationToPlay) {
            Object.values(remote.animations).forEach(anim => anim.stop());
            if (remote.animations[animationToPlay]) {
                remote.animations[animationToPlay].start(true);
                remote.currentAnimation = animationToPlay;
            }
        }
    }
};

function getMovementAnimation(direction) {
    console.log(`Received direction: ${direction}`);
    let animationMap = {
        "forward": "run",
        "forwardleft": "run_right",
        "forwardright": "run_left",
        "backward": "run_back",
        "backwardleft": "run_right",
        "backwardright": "run_left",
        "right": "run_left",
        "left": "run_right",
        "idle": "idle"
    };
    let animationToPlay = animationMap[direction] || "idle";
    return animationToPlay;
}

window.handlePlayerDisconnected = function(data) {
    if (remotePlayers[data.id] && remotePlayers[data.id].model) {
        remotePlayers[data.id].model.dispose();
        delete remotePlayers[data.id];
    }
    recentlyDisconnected[data.id] = Date.now();
};
