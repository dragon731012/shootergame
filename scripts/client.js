const socket = io('https://server.addmask.com'); // Replace with your actual server domain
let userid;

socket.on('connect', () => {
    console.log('Connected to server with ID:', socket.id);
    userid=socket.id;
});

socket.on('playerMoved', (data) => {
    if (window.handleOtherPlayerMovement) {
        window.handleOtherPlayerMovement(data);
    }
});

socket.on('playerShot', (data) => {
    if (window.handleOtherPlayerShoot) {
        window.handleOtherPlayerShoot(data);
    }
});

socket.on('recieveDamageEvent', (data) => {
    if (window.handleRecieveDamageEvent) {
        window.handleRecieveDamageEvent(data);
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
    sendShootEvent: function(gunPosition, direction, gun) {
        socket.emit('shoot', { 
            position: gunPosition, 
            direction: { x: direction.x, y: direction.y, z: direction.z },
            gun: gun
        });
    },
    sendDamageEvent: function(id, playersent, damage) {
        socket.emit('sendDamageEvent', { 
            id: id, 
            playersent: playersent,
            damage: damage
        });
    }
};

let remotePlayers = {}; 
let recentlyDisconnected = {};

function createRemotePlayer(playerId, position) {
    if (remotePlayers[playerId]) return;

    remotePlayers[playerId] = { loading: true };

    BABYLON.SceneLoader.ImportMeshAsync("", "assets/", "player.glb", scene)
        .then(result => {
            let remoteModel=result.meshes[0];
            remoteModel.name=playerId;
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
            delete remotePlayers[playerId]; 
        });
}


scene.onBeforeRenderObservable.add(() => {
    const now = Date.now();
    for (const playerId in remotePlayers) {
        const remote = remotePlayers[playerId];
        if (remote.loading) continue;
        const elapsed = now - remote.interpolationStartTime;
        const t = Math.min(elapsed / 100, 1);
        remote.model.position = BABYLON.Vector3.Lerp(remote.startPosition, remote.targetPosition, t);
    }
});

window.handleRecieveDamageEvent = function(data) {
    hp-=data.damage;
    if (hp<=0) alert("you died!");
}

function wasShot(player, gun) {
    hp-=gun.damage;
    if (hp<=0) alert("you died!");
}

window.handleOtherPlayerShoot = async function(data) {
    let remote = remotePlayers[data.id];
    
    let animationToPlay;

    animationToPlay = getMovementAnimation("shoot");

    if (remote && remote.currentAnimation !== animationToPlay) {
        Object.values(remote.animations).forEach(anim => anim.stop());
        if (remote.animations[animationToPlay]) {
            remote.animations[animationToPlay].start(true);
            remote.currentAnimation = animationToPlay;
        }
    }

    var bullet = await add3d("assets/bullet.glb");
    bullet.isVisible = false;
    bullet.scaling = new BABYLON.Vector3(0.1, 0.1, 0.1);

    const bulletMaterial = new BABYLON.StandardMaterial("bulletMaterial", scene);
    bulletMaterial.diffuseColor = new BABYLON.Color3(1, 1, 0);
    bullet.material = bulletMaterial;

    const bulletDirection = new BABYLON.Vector3(data.direction.x, data.direction.y, data.direction.z);

    bullet.parent=remote.model;

    bullet.position=new BABYLON.Vector3(0.1,1.4,1);
    bullet.rotation=new BABYLON.Vector3(0,0,Math.PI);

    bullet.setParent(null);
    
    const bulletPhysics = new BABYLON.PhysicsAggregate(
        bullet,
        BABYLON.PhysicsShapeType.BOX,
        { mass: 0.001 },
        scene
    );

    bulletPhysics.body.filterMembershipMask = 0;
    bulletPhysics.body.filterCollideMask = 0;

    bulletPhysics.body.setAngularVelocity(new BABYLON.Vector3(0, 0, 0)); 
    bulletPhysics.body.setMassProperties({ inertia: new BABYLON.Vector3(0, 0, 0) });
    
    const shootForce = 1;

    bulletPhysics.body.applyImpulse(bulletDirection.scale(shootForce), bullet.position);
    
    bullet.isVisible = true;

    const rayLength = bulletDirection.length();
    const ray = new BABYLON.Ray(bullet.position, bulletDirection, rayLength);
    const pickInfo = ray.intersectsMesh(targetMesh, true);
    if (pickInfo.hit) {
        console.log(pickInfo);
    }

    onCollisionStart(bullet,(e)=>{
        var name=e.collidedAgainst.transformNode.name;
        if (name=="playerhitbox") wasShot(remote, data.gun);
        console.log(name);
        if (name!=userid && name!="player") bullet.dispose();
    });
};

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

    if (!remotePlayers[data.id] || remotePlayers[data.id].loading) {
        createRemotePlayer(data.id, newPos);
    } else {
        const remote = remotePlayers[data.id];
        remote.startPosition.copyFrom(remote.model.position);
        remote.targetPosition.copyFrom(newPos);
        remote.interpolationStartTime = currentTime;
        remote.lastUpdateTime = currentTime;

        if (data.rotationData) {
            const dir = new BABYLON.Vector3(
                data.rotationData.x,
                data.rotationData.y,
                data.rotationData.z
            );
            const yaw = Math.atan2(dir.x, dir.z);
            remote.model.rotationQuaternion = BABYLON.Quaternion.RotationYawPitchRoll(yaw, 0, 0);
        }

        let animationToPlay = getMovementAnimation(data.direction);

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
    let animationMap = {
        "forward": "run",
        "forwardleft": "run_right",
        "forwardright": "run_left",
        "backward": "run_back",
        "backwardleft": "run_right",
        "backwardright": "run_left",
        "right": "run_left",
        "left": "run_right",
        "idle": "idle",
        "shoot": "gun_shoot",
        "movingshoot": "run_rhoot"
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
