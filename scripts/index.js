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
var currentgunpos = -0.42;
const enemySpawnInterval = 2000;
const jumpForce = 80;
const jumpForceIncrease = 4;
let gunBobbingOffset = 0;

canvas.addEventListener('click', () => {
    canvas.requestPointerLock = canvas.requestPointerLock || canvas.mozRequestPointerLock;
    canvas.requestPointerLock();
});

function jump() {
    let velocity = playerBody.body.getLinearVelocity();

    // Check if the player is grounded (velocity.y should be near 0)
    if (Math.abs(velocity.y) < 0.1 && canJump) {
        canJump = false; // Disable jumping until the player lands

        // Apply an upward impulse to simulate the jump
        const jumpImpulse = new BABYLON.Vector3(0, jumpForce, 0);
        playerBody.body.applyImpulse(jumpImpulse, player.position);
        
        // You can add a small delay or event when landing to reset `canJump` to true
        setTimeout(() => canJump = true, 500);  // Assuming the player lands in about half a second
    }
}




const createScene = async () => {
    scene = new BABYLON.Scene(engine);

    const gravityVector = new BABYLON.Vector3(0, -20, 0);
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
    currentgunpos = -0.42;
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
        { mass: 10, restitution:0 },
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
        forward.y = playerBody.body.getLinearVelocity().y;
        right.y = playerBody.body.getLinearVelocity().y;

        if (forwardMovement>0 && forwardMovement<moveSpeed){
            forwardMovement=moveSpeed;
        }

        if (forwardMovement<0 && forwardMovement>-moveSpeed){
            forwardMovement=moveSpeed;
        }


        // Combine forward and right movement
        const movement = forward.scale(forwardMovement).add(right.scale(rightMovement));

        movement.y = playerBody.body.getLinearVelocity().y;

        // Apply the horizontal movement as linear velocity to the player's physics body        
        playerBody.body.setLinearVelocity(movement);

        if (keyMap[" "] && canJump) {
            if (gun) gun.position.y = currentgunpos;
            jump();
            console.log("jumping");
        }

        // Sync camera position with player position
        camera.position.copyFrom(player.position);
        camera.setTarget(player.position);

        if (keyMap["w"] && !keyMap["s"] && Math.abs(playerBody.body.getLinearVelocity().y) < 0.1) {
            gun.rotation = new BABYLON.Vector3(0, Math.PI / 2, 0);
            currentgunpos = -0.42;
            gun.position.y = currentgunpos + 0.025 * Math.sin(Date.now() * 0.015);
        }

        if (keyMap["s"] && !keyMap["w"] && Math.abs(playerBody.body.getLinearVelocity().y) < 0.1) {
            gun.rotation = new BABYLON.Vector3(0, Math.PI / 2, 0);
            currentgunpos = -0.4;
            gun.position.y = currentgunpos + 0.025 * Math.sin(Date.now() * 0.015);
        }

        if (keyMap["a"] && !keyMap["s"] && !keyMap["d"]) {
            gun.rotation = new BABYLON.Vector3(-0.1, Math.PI / 2, 0);
            currentgunpos = -0.3;
            gun.position.y = currentgunpos + 0.025 * Math.sin(Date.now() * 0.015);
        }

        if (keyMap["d"] && !keyMap["s"] && !keyMap["a"]) {
            gun.rotation = new BABYLON.Vector3(0.1, Math.PI / 2, 0);
            currentgunpos = -0.6;
            gun.position.y = currentgunpos + 0.025 * Math.sin(Date.now() * 0.015);
        }

        if (!keyMap["w"] && !keyMap["a"] && !keyMap["s"] && !keyMap["d"]){
            gun.position.y = -0.42;
            gun.rotation = new BABYLON.Vector3(0, Math.PI / 2, 0);
        }
    
        let velocityY = playerBody.body.getLinearVelocity().y;

        if (gun && Math.abs(playerBody.body.getLinearVelocity().y) > 0.1) gun.position.y -= velocityY / 50;
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
