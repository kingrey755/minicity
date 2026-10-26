
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const host = document.getElementById("city-view");
const status = document.getElementById("city-status");
const countLabel = document.getElementById("object-count");
const toast = document.getElementById("toast");

const SIZE = 24;
const HALF = SIZE / 2;
const CELL = 1;

const scene = new THREE.Scene();
scene.background = new THREE.Color("#101b2b");
scene.fog = new THREE.Fog("#101b2b", 32, 65);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 150);
camera.position.set(19, 23, 25);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
host.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.maxPolarAngle = Math.PI / 2.05;
controls.minDistance = 10;
controls.maxDistance = 48;
controls.update();

scene.add(new THREE.HemisphereLight("#dceaff", "#65745d", 2));

const sunlight = new THREE.DirectionalLight("#fff0d5", 3);
sunlight.position.set(-12, 25, 15);
sunlight.castShadow = true;
sunlight.shadow.mapSize.set(2048, 2048);
sunlight.shadow.camera.left = -20;
sunlight.shadow.camera.right = 20;
sunlight.shadow.camera.top = 20;
sunlight.shadow.camera.bottom = -20;
scene.add(sunlight);

const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(SIZE, SIZE),
    new THREE.MeshStandardMaterial({ color: "#263b38", roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
ground.position.y = -0.04;
scene.add(ground);

const grid = new THREE.GridHelper(SIZE, SIZE, "#648b83", "#405d58");
grid.position.y = 0.005;
scene.add(grid);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

const groundPlane = new THREE.Plane(
    new THREE.Vector3(0, 1, 0),
    0
);

const occupied = new Set();
const objects = [];
const roadMeshes = [];
let activeTool = "select";
let roadStart = null;
let roadEnd = null;
let roadPreview = [];
let toastTimer;

const materials = {
    small: ["#70a5f5", "#4c79c0"],
    medium: ["#a58df7", "#7964c5"],
    large: ["#f2a66c", "#bf784b"],
    house: ["#e8d6b6", "#b7a184"],
    road: ["#586477", "#465164"]
};

function cellKey(x, z) {
    return `${x},${z}`;
}

function inBounds(x, z) {
    return x >= 0 && z >= 0 && x < SIZE && z < SIZE;
}

function worldPosition(x, z) {
    return {
        x: x - HALF + 0.5,
        z: z - HALF + 0.5
    };
}

function setPointer(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

function getCell(event) {
    setPointer(event);
    raycaster.setFromCamera(pointer, camera);

    const point = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(groundPlane, point)) return null;

    const x = Math.floor(point.x + HALF);
    const z = Math.floor(point.z + HALF);

    return inBounds(x, z) ? { x, z } : null;
}

function makeMaterial(color, roughness = 0.8) {
    return new THREE.MeshStandardMaterial({
        color,
        roughness,
        metalness: 0.02
    });
}

function addBox(parent, width, height, depth, x, y, z, color, options = {}) {
    const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(width, height, depth),
        makeMaterial(color)
    );

    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    if (options.rotationY) mesh.rotation.y = options.rotationY;

    parent.add(mesh);
    return mesh;
}

function createBuilding(type, x, z) {
    const group = new THREE.Group();
    const footprint = type === "large" ? 3 : type === "medium" ? 2 : 1;
    const colors = materials[type];
    const height = type === "small" ? 1.5 : type === "medium" ? 3 : 5.2;

    const p = worldPosition(x, z);
    group.position.set(p.x + (footprint - 1) / 2, 0, p.z + (footprint - 1) / 2);

    const width = footprint * 0.84;
    const depth = footprint * 0.84;

    addBox(group, width, height, depth, 0, height / 2, 0, colors[0]);

    addBox(
        group,
        width + 0.12,
        0.13,
        depth + 0.12,
        0,
        height + 0.065,
        0,
        colors[1]
    );

    const windows = makeMaterial("#bfe9ed", 0.35);
    const windowSize = footprint === 1 ? 0.2 : 0.27;
    const floors = Math.max(1, Math.floor(height / 1.05));

    for (let floor = 0; floor < floors; floor++) {
        const y = 0.4 + floor * (height / (floors + 0.2));
        if (y > height - 0.2) continue;

        const columns = footprint === 1 ? 1 : footprint;
        const spacing = width / (columns + 0.5);

        for (let col = 0; col < columns; col++) {
            const wx = -width / 2 + spacing * (col + 0.75);

            const front = new THREE.Mesh(
                new THREE.BoxGeometry(windowSize, windowSize, 0.035),
                windows
            );
            front.position.set(wx, y, depth / 2 + 0.02);
            group.add(front);

            const side = new THREE.Mesh(
                new THREE.BoxGeometry(0.035, windowSize, windowSize),
                windows
            );
            side.position.set(width / 2 + 0.02, y, wx);
            group.add(side);
        }
    }

    if (type === "large") {
        addBox(group, width * 0.24, 0.4, depth * 0.24, 0, height + 0.33, 0, "#d7dfe8");
    }

    scene.add(group);

    const cells = [];
    for (let dx = 0; dx < footprint; dx++) {
        for (let dz = 0; dz < footprint; dz++) {
            cells.push(cellKey(x + dx, z + dz));
        }
    }

    cells.forEach(key => occupied.add(key));
    objects.push({ group, cells, type });

    return true;
}

function createHouse(x, z) {
    const group = new THREE.Group();
    const p = worldPosition(x, z);
    group.position.set(p.x, 0, p.z);

    addBox(group, 0.65, 0.65, 0.65, 0, 0.36, 0, "#e6d4b7");
    addBox(group, 0.14, 0.28, 0.04, 0, 0.18, 0.347, "#755442");

    const roof = new THREE.Mesh(
        new THREE.ConeGeometry(0.56, 0.5, 4),
        makeMaterial("#c66c58")
    );
    roof.position.y = 0.93;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    group.add(roof);

    const windowMaterial = makeMaterial("#a9dbe8", 0.4);

    for (const side of [-1, 1]) {
        const windowMesh = new THREE.Mesh(
            new THREE.BoxGeometry(0.16, 0.17, 0.035),
            windowMaterial
        );
        windowMesh.position.set(side * 0.2, 0.42, 0.34);
        group.add(windowMesh);
    }

    addBox(group, 0.12, 0.38, 0.12, 0.2, 1.02, -0.12, "#a2a9b0");

    scene.add(group);
    const cells = [cellKey(x, z)];
    occupied.add(cells[0]);
    objects.push({ group, cells, type: "house" });
    return true;
}

function createRoad(x, z) {
    const group = new THREE.Group();
    const p = worldPosition(x, z);
    group.position.set(p.x, 0, p.z);

    addBox(group, 0.98, 0.055, 0.98, 0, 0.035, 0, "#586477");

    const stripe = makeMaterial("#e1d7a7");
    const marker = new THREE.Mesh(
        new THREE.BoxGeometry(0.055, 0.009, 0.36),
        stripe
    );
    marker.position.y = 0.067;
    group.add(marker);

    scene.add(group);
    const cells = [cellKey(x, z)];
    occupied.add(cells[0]);
    objects.push({ group, cells, type: "road" });
    roadMeshes.push(group);
}

function canPlace(type, x, z) {
    const footprint = type === "large" ? 3 : type === "medium" ? 2 : 1;

    if (x + footprint > SIZE || z + footprint > SIZE) return false;

    for (let dx = 0; dx < footprint; dx++) {
        for (let dz = 0; dz < footprint; dz++) {
            if (occupied.has(cellKey(x + dx, z + dz))) return false;
        }
    }

    return true;
}

function placeObject(type, x, z) {
    if (!canPlace(type, x, z)) {
        showToast("That space is occupied or outside the grid.");
        return;
    }

    if (type === "road") createRoad(x, z);
    else if (type === "house") createHouse(x, z);
    else createBuilding(type, x, z);

    updateCount();
    status.textContent = `${type[0].toUpperCase() + type.slice(1)} placed`;
}

function updateCount() {
    countLabel.textContent = `${objects.length} object${objects.length === 1 ? "" : "s"} placed`;
}

function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 1800);
}

function setTool(tool) {
    activeTool = tool;
    roadStart = null;
    roadEnd = null;
    clearPreview();

    document.querySelectorAll(".tool").forEach(button => {
        button.classList.toggle("active", button.dataset.tool === tool);
    });

    const names = {
        select: "Select a building tool",
        small: "Small building selected",
        medium: "Medium building selected",
        large: "Large building selected",
        house: "House selected",
        road: "Road tool selected — drag to draw"
    };

    status.textContent = names[tool];
    renderer.domElement.style.cursor = tool === "select" ? "grab" : "crosshair";
}

document.querySelectorAll(".tool").forEach(button => {
    button.addEventListener("click", () => setTool(button.dataset.tool));
});

function clearPreview() {
    roadPreview.forEach(mesh => scene.remove(mesh));
    roadPreview = [];
}

function getRoadPath(start, end) {
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const path = [];

    if (Math.abs(dx) >= Math.abs(dz)) {
        const step = Math.sign(dx) || 1;
        for (let x = start.x; step > 0 ? x <= end.x : x >= end.x; x += step) {
            path.push({ x, z: start.z });
        }
    } else {
        const step = Math.sign(dz) || 1;
        for (let z = start.z; step > 0 ? z <= end.z : z >= end.z; z += step) {
            path.push({ x: start.x, z });
        }
    }

    return path;
}

function updateRoadPreview(end) {
    clearPreview();
    if (!roadStart || !end) return;

    const path = getRoadPath(roadStart, end);
    roadPreview = [];

    for (const cell of path) {
        const p = worldPosition(cell.x, cell.z);
        const valid = !occupied.has(cellKey(cell.x, cell.z));
        const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(0.94, 0.07, 0.94),
            new THREE.MeshBasicMaterial({
                color: valid ? "#71e2c1" : "#f06b75",
                transparent: true,
                opacity: 0.65
            })
        );

        mesh.position.set(p.x, 0.08, p.z);
        scene.add(mesh);
        roadPreview.push(mesh);
    }
}

renderer.domElement.addEventListener("click", event => {
    if (activeTool === "select" || activeTool === "road") return;

    const cell = getCell(event);
    if (!cell) return;

    placeObject(activeTool, cell.x, cell.z);
});

renderer.domElement.addEventListener("pointerdown", event => {
    if (activeTool !== "road" || event.button !== 0) return;

    const cell = getCell(event);
    if (!cell) return;

    roadStart = cell;
    roadEnd = cell;
    controls.enabled = false;
    updateRoadPreview(cell);
});

renderer.domElement.addEventListener("pointermove", event => {
    if (activeTool !== "road" || !roadStart) return;

    const cell = getCell(event);
    if (!cell) return;

    roadEnd = cell;
    updateRoadPreview(cell);
});

window.addEventListener("pointerup", () => {
    if (activeTool !== "road" || !roadStart) return;

    const path = getRoadPath(roadStart, roadEnd || roadStart);
    const valid = path.every(cell => !occupied.has(cellKey(cell.x, cell.z)));

    clearPreview();

    if (valid) {
        path.forEach(cell => createRoad(cell.x, cell.z));
        updateCount();
        status.textContent = `${path.length} road tile${path.length === 1 ? "" : "s"} placed`;
    } else {
        showToast("Road blocked — no tiles were placed.");
    }

    roadStart = null;
    roadEnd = null;
    controls.enabled = true;
});

document.getElementById("clear-button").addEventListener("click", () => {
    objects.forEach(object => scene.remove(object.group));
    objects.length = 0;
    roadMeshes.length = 0;
    occupied.clear();
    clearPreview();
    roadStart = null;
    roadEnd = null;
    controls.enabled = true;
    updateCount();
    status.textContent = "City cleared";
    showToast("Your city is now empty.");
});

function resize() {
    const width = host.clientWidth;
    const height = host.clientHeight;

    if (!width || !height) return;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
}

window.addEventListener("resize", resize);
resize();

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

animate();
