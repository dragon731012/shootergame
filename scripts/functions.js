function Explode(item,size,length)
    {
        // Create default particle systems
        var fireBlast = BABYLON.ParticleHelper.CreateDefault(new BABYLON.Vector3(0,0,0), 100);
        fireBlast.emitter=item;

        var fireBlastHemisphere = fireBlast.createHemisphericEmitter(.2, 0);
 
        // Set emission rate
        fireBlast.emitRate = 10000;

        // Start size
        fireBlast.minSize = size;
        fireBlast.maxSize = size+size/5;

        // Lifetime
        fireBlast.minLifeTime = 0.1;
        fireBlast.maxLifeTime = 0.3;

        // Emission power
        fireBlast.minEmitPower = 5;
        fireBlast.maxEmitPower = 10;

        // Limit velocity over time
        fireBlast.addLimitVelocityGradient(0, 40);
        fireBlast.addLimitVelocityGradient(0.120, 12.983);
        fireBlast.addLimitVelocityGradient(0.445, 1.780);
        fireBlast.addLimitVelocityGradient(0.691, 0.502);
        fireBlast.addLimitVelocityGradient(0.930, 0.05);
        fireBlast.addLimitVelocityGradient(1.0, 0);

        fireBlast.limitVelocityDamping = 0.9;

        // Start rotation
        fireBlast.minInitialRotation = -Math.PI / 2;
        fireBlast.maxInitialRotation = Math.PI / 2;

        // Texture
        fireBlast.particleTexture = new BABYLON.Texture("assets/shot.png", scene);
        fireBlast.blendMode = BABYLON.ParticleSystem.BLENDMODE_MULTIPLYADD; 

        // Color over life
        fireBlast.addColorGradient(0.0, new BABYLON.Color4(1, 1, 1, 0));
        fireBlast.addColorGradient(0.1, new BABYLON.Color4(1, 1, 1, 1));
        fireBlast.addColorGradient(0.9, new BABYLON.Color4(1, 1, 1, 1));
        fireBlast.addColorGradient(1.0, new BABYLON.Color4(1, 1, 1, 0));

        // // Defines the color ramp to apply
        fireBlast.addRampGradient(0.0, new BABYLON.Color3(1, 1, 1));
        fireBlast.addRampGradient(0.09, new BABYLON.Color3(209/255, 204/255, 15/255));
        fireBlast.addRampGradient(0.18, new BABYLON.Color3(221/255, 120/255, 14/255));
        fireBlast.addRampGradient(0.28, new BABYLON.Color3(200/255, 43/255, 18/255));
        fireBlast.addRampGradient(0.47, new BABYLON.Color3(115/255, 22/255, 15/255));
        fireBlast.addRampGradient(0.88, new BABYLON.Color3(14/255, 14/255, 14/255));
        fireBlast.addRampGradient(1.0, new BABYLON.Color3(14/255, 14/255, 14/255));
        fireBlast.useRampGradients = true;

        // Defines the color remapper over time
        fireBlast.addColorRemapGradient(0, 0, 0.1);
        fireBlast.addColorRemapGradient(0.2, 0.1, 0.8);
        fireBlast.addColorRemapGradient(0.3, 0.2, 0.85);
        fireBlast.addColorRemapGradient(0.35, 0.4, 0.85);
        fireBlast.addColorRemapGradient(0.4, 0.5, 0.9);
        fireBlast.addColorRemapGradient(0.5, 0.95, 1.0);
        fireBlast.addColorRemapGradient(1.0, 0.95, 1.0);

        // Particle system start
        fireBlast.start(30);
        fireBlast.targetStopDuration = length;

        // Animation update speed
        fireBlast.updateSpeed = 1/60;

        // Rendering order
        fireBlast.renderingGroupId = 1;
    }

    async function add3d(path) {
        return new Promise((resolve) => {
            var name = path.split("/")[path.split("/").length - 1];
            path = path.replace(name, "");
            BABYLON.SceneLoader.ImportMesh(
                "",
                path,
                name,
                scene,
                function (meshes) {
                    resolve(meshes[0]);
                }
            );
        });
    }

function onCollisionStart(mesh,callback){
    mesh.physicsBody.setCollisionCallbackEnabled(true);

    const hk = physicsPlugin;
    const started = hk._hknp.EventType.COLLISION_STARTED.value;
    const continued = hk._hknp.EventType.COLLISION_CONTINUED.value;
    const finished = hk._hknp.EventType.COLLISION_FINISHED.value;
    
    const eventMask = started | continued | finished;
    mesh.physicsBody.setEventMask(eventMask);

    const observable = mesh.physicsBody.getCollisionObservable();
    observable.add((collisionEvent) => {
        callback(collisionEvent);
    });
}

function onCollisionEnd(mesh,callback){
    mesh.physicsBody?.onContactEnd((event) => {
        callback(event);
    });
}