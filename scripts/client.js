const socket = io('https://server.addmask.com');
let remotePlayers = {};
let playerAssetsPromise = null;

// Preload assets once
async function loadPlayerAssets() {
    if (!playerAssetsPromise) {
        playerAssetsPromise = BABYLON.SceneLoader.ImportMeshAsync(null, "assets/", "player.glb", scene)
            .then(result => ({
                meshes: result.meshes,
                animationGroups: result.animationGroups
            }));
    }
    return playerAssetsPromise;
}

// Create individual player instances
async function createRemotePlayer(playerId, position) {
    try {
        const { meshes, animationGroups } = await loadPlayerAssets();
        
        // Create new instance
        const rootMesh = meshes[0].clone(`player_${playerId}`);
        rootMesh.position.copyFrom(position);
        rootMesh.isVisible = true;
        rootMesh.scaling = new BABYLON.Vector3(1, 1, 1);
        
        // Clone animations
        const animations = {};
        animationGroups.forEach(originalAG => {
            const ag = originalAG.clone(`anim_${playerId}_${originalAG.name}`);
            animations[originalAG.name.toLowerCase()] = ag;
        });

        remotePlayers[playerId] = {
            rootMesh,
            animations,
            currentAnimation: null,
            lastPosition: position.clone()
        };

        playAnimation(playerId, 'idle');

    } catch (error) {
        console.error(`Failed to create player ${playerId}:`, error);
    }
}

// Animation control
function playAnimation(playerId, animationName) {
    const player = remotePlayers[playerId];
    if (!player) return;

    animationName = animationName.toLowerCase();
    if (player.currentAnimation === animationName) return;

    // Stop current animation
    if (player.currentAnimation) {
        player.animations[player.currentAnimation].stop();
    }

    // Start new animation
    const animGroup = player.animations[animationName];
    if (animGroup) {
        animGroup.start(true);
        player.currentAnimation = animationName;
    }
}

// Movement handling
window.handleOtherPlayerMovement = function(data) {
    const playerId = data.id;
    const newPos = new BABYLON.Vector3(data.movementData.x, data.movementData.y, data.movementData.z);

    if (!remotePlayers[playerId]) {
        createRemotePlayer(playerId, newPos);
    } else {
        const player = remotePlayers[playerId];
        player.rootMesh.position.copyFrom(newPos);

        // Update rotation
        if (data.rotationData) {
            const dir = new BABYLON.Vector3(data.rotationData.x, data.rotationData.y, data.rotationData.z);
            player.rootMesh.rotationQuaternion = BABYLON.Quaternion.RotationYawPitchRoll(
                Math.atan2(dir.x, dir.z), 0, 0
            );
        }

        // Update animation
        playAnimation(playerId, getMovementAnimation(data.direction));
    }
};

// Cleanup
window.handlePlayerDisconnected = function(data) {
    const player = remotePlayers[data.id];
    if (player) {
        // Dispose all resources
        player.rootMesh.dispose();
        Object.values(player.animations).forEach(anim => anim.dispose());
        delete remotePlayers[data.id];
    }
};

// Initialization
(async function init() {
    try {
        await loadPlayerAssets();
        console.log("Player assets loaded successfully");
    } catch (error) {
        console.error("Failed to initialize player assets:", error);
    }
})();