const canvas = document.getElementById("renderCanvas");
const engine = new BABYLON.Engine(canvas, true);

let scene;
let camera;
let player;
let playerBody;
let showbullet;
let gun;
let enemies = [];
let keyMap = {};
let isShooting = false;
let canJump = true;
const moveSpeed = 10;
const shootForce = 1;
const enemySpawnInterval = 2000;
const jumpForce = 40;
const jumpForceIncrease = 4;

canvas.addEventListener('click', () => {
    canvas.requestPointerLock = canvas.requestPointerLock || canvas.mozRequestPointerLock;
    canvas.requestPointerLock();
});

function jump() {
    let velocity = playerBody.body.getLinearVelocity();

    // Check if the player is grounded (velocity.y should be 0 or near 0)
    if (Math.abs(velocity.y) < 0.1 && canJump) {
        canJump = false; // Disable jumping until the player lands

        let interval = setInterval(() => {
            if (velocity.y + jumpForceIncrease < jumpForce) {
                if (velocity.y + jumpForceIncrease < jumpForce*.7) {
                    velocity.y += jumpForceIncrease;
                    playerBody.body.setLinearVelocity(velocity);
                    console.log(playerBody.body.getLinearVelocity());
                } else {
                    velocity.y += jumpForceIncrease*.01;
                    playerBody.body.setLinearVelocity(velocity);
                    console.log(playerBody.body.getLinearVelocity());
                }
            } else {
                clearInterval(interval);
                canJump=true;
            }
        }, 10);
    }
}



const createScene = async () => {
    scene = new BABYLON.Scene(engine);

    const gravityVector = new BABYLON.Vector3(0, -1500, 0);
    const havokInstance = await HavokPhysics();
    const physicsPlugin = new BABYLON.HavokPlugin(true, havokInstance);
    scene.enablePhysics(gravityVector, physicsPlugin);

    camera = new BABYLON.ArcRotateCamera(
        "camera1",
        -Math.PI / 2,
        Math.PI / 4,
        10,
        new BABYLON.Vector3(0, 0, 0),
    );
    camera.upperRadiusLimit = 0;
    camera.lowerRadiusLimit = 0;
    /*
    camera.lowerAlphaLimit = -Math.PI / 2;
    camera.upperAlphaLimit = Math.PI / 2;
    */
    camera.lowerBetaLimit = 0.1;
    camera.upperBetaLimit = Math.PI;
    camera.setTarget(BABYLON.Vector3.Zero());
    camera.attachControl(canvas, true);
    camera.fov = Math.PI / 3; 
    camera.minZ = 0.1; 
    camera.maxZ = 1000; 

    const light = new BABYLON.HemisphericLight("light", new BABYLON.Vector3(0, 1, 0), scene);
    light.intensity = 0.7;

    const ground = BABYLON.MeshBuilder.CreateGround("ground", { width: 50, height: 50 }, scene);
    ground.position.y = -1;
    ground.scaling = new BABYLON.Vector3(10, 1, 10);

    const groundMaterial = new BABYLON.StandardMaterial("groundMaterial", scene);
    groundMaterial.diffuseColor = new BABYLON.Color3(0.5, 0.5, 0.5);
    ground.material = groundMaterial;

    new BABYLON.PhysicsAggregate(
        ground,
        BABYLON.PhysicsShapeType.BOX,
        { mass: 0, friction: 0.5, restitution: 0.1 },
        scene
    );

    player = BABYLON.MeshBuilder.CreateSphere("player", { size: 1 }, scene);
    player.scaling = new BABYLON.Vector3(4, 4, 4);
    player.isVisible=false;

    camera.target = player;

    gun = await add3d("/assets/machinegun.glb");
    gun.parent = camera;
    currentgunpos = -0.4;
    gun.position = new BABYLON.Vector3(1.75, -0.42, 0.5);
    gun.rotation = new BABYLON.Vector3(0, Math.PI / 2, 0);

    const hl = new BABYLON.HighlightLayer("highlight", scene);

    showbullet = BABYLON.MeshBuilder.CreateBox("showbullet", {}, scene);
    showbullet.scaling=new BABYLON.Vector3(0.06, 0.06, 0.06);
    const showbulletMaterial = new BABYLON.StandardMaterial("showbulletMaterial", scene);
    showbulletMaterial.diffuseColor = new BABYLON.Color3(1, 1, 0);
    showbullet.parent=gun;
    showbullet.isVisible=false;
    showbullet.position=new BABYLON.Vector3(-0.9, 0.14, 1.65);
    showbullet.rotation = new BABYLON.Vector3(0, 0, 0);
    showbullet.rotation.z=-Math.PI/2+Math.PI/3;
    showbullet.material = showbulletMaterial;

    playerBody=new BABYLON.PhysicsAggregate(
        player,
        BABYLON.PhysicsShapeType.BOX,
        { mass: 1 },
        scene
    );

    document.addEventListener("click", () => {
        Explode(showbullet,0.01,0.02);

        var bullet = BABYLON.MeshBuilder.CreateBox("bullet", {isVisible:false}, scene);
        bullet.isVisible=false;
        bullet.scaling=new BABYLON.Vector3(0.1, 0.1, 0.1);
        const bulletMaterial = new BABYLON.StandardMaterial("bulletMaterial", scene);
        bulletMaterial.diffuseColor = new BABYLON.Color3(1, 1, 0);
        
        hl.addMesh(bullet, BABYLON.Color3.Yellow());

        bullet.parent=gun;
        bullet.position=new BABYLON.Vector3(-0.3, 0.14, 1.65);
        bullet.rotation = new BABYLON.Vector3(0, 0, 0);
        bullet.material = bulletMaterial;
    
        const crosshairRay = camera.getForwardRay();
        const crosshairDirection = crosshairRay.direction.clone().normalize();
    
        const bulletDirection = crosshairDirection;
    
        const bulletPhysics = new BABYLON.PhysicsAggregate(
            bullet,
            BABYLON.PhysicsShapeType.BOX,
            { mass: 0.0001 },
            scene
        );
        bulletPhysics.body.applyImpulse(bulletDirection.scale(shootForce), bullet.position);
        bullet.parent=null;
        bullet.isVisible=true;

    });
    
    
    

    const spawnEnemy = () => {
        const enemy = BABYLON.MeshBuilder.CreateBox("enemy", { size: 1 }, scene);
        enemy.position = new BABYLON.Vector3(
            Math.random() * 20 - 10,
            1,
            Math.random() * 20 - 10
        );

        const enemyMaterial = new BABYLON.StandardMaterial("enemyMaterial", scene);
        enemyMaterial.diffuseColor = new BABYLON.Color3(0, 1, 0);
        enemy.material = enemyMaterial;

        new BABYLON.PhysicsAggregate(
            enemy,
            BABYLON.PhysicsShapeType.BOX,
            { mass: 1 },
            scene
        );
        enemies.push(enemy);
    };

    setInterval(spawnEnemy, enemySpawnInterval);
    
    scene.onBeforeRenderObservable.add(() => {
        // Define movement inputs
        let forwardMovement = 0;
        let rightMovement = 0;
        let upMovement = 0;

        if (keyMap["w"]) forwardMovement = moveSpeed;
        if (keyMap["s"]) forwardMovement = -moveSpeed;
        if (keyMap["d"]) rightMovement = moveSpeed;
        if (keyMap["a"]) rightMovement = -moveSpeed;



        // Get camera forward and right directions
        const forward = camera.getForwardRay().direction;
        const right = BABYLON.Vector3.Cross(BABYLON.Vector3.Up(), forward).normalize();

        // Zero out vertical movement
        forward.y = 0;
        right.y = 0;

        if (forwardMovement>0 && forwardMovement<moveSpeed){
            forwardMovement=moveSpeed;
        }

        if (forwardMovement<0 && forwardMovement>-moveSpeed){
            forwardMovement=moveSpeed;
        }


        // Combine forward and right movement
        const movement = forward.scale(forwardMovement).add(right.scale(rightMovement));

        // Apply the horizontal movement as linear velocity to the player's physics body        
        playerBody.body.setLinearVelocity(movement);

        if (keyMap[" "] && canJump) {
            jump();
            console.log("jumping");
        }

        // Sync camera position with player position
        camera.position.copyFrom(player.position);
        camera.setTarget(player.position);
    });



    engine.runRenderLoop(() => {
        if (scene) {
            scene.render();
        }
    });

    window.addEventListener("resize", () => {
        engine.resize();
    });
};

createScene().then(() => {
    window.addEventListener("keydown", (event) => {
        keyMap[event.key] = true;
    });

    window.addEventListener("keyup", (event) => {
        keyMap[event.key] = false;
    });
});
