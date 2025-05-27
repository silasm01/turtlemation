import * as THREE from 'https://threejsfundamentals.org/threejs/resources/threejs/r122/build/three.module.js';
import { OrbitControls } from 'https://threejsfundamentals.org/threejs/resources/threejs/r122/examples/jsm/controls/OrbitControls.js';
import { OBJLoader } from 'https://threejsfundamentals.org/threejs/resources/threejs/r122/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'https://threejsfundamentals.org/threejs/resources/threejs/r122/examples/jsm/loaders/MTLLoader.js';

import { GLTFLoader } from "https://cdn.jsdelivr.net/npm/three@0.121.1/examples/jsm/loaders/GLTFLoader.js";

let scene, camera, renderer, controls;
let turtleMesh = null;
let blockMeshes = [];
let blockMeshData = new Map(); // Map mesh to {x, y, z}
let contextMenu = null;
let turtleObj = null;
let turtleObjLoaded = false;
let pendingStatus = null;
let pendingBlockStats = null;

// GLTFLoader for turtle model
const gltfLoader = new GLTFLoader();
gltfLoader.setPath('/static/models/');
gltfLoader.load('turtle_base.gltf', function (gltf) {
  console.log("Turtle model loaded:", gltf);
  turtleObj = gltf.scene;
  turtleObjLoaded = true;
  // If there was a pending world update, render it now
  if (pendingStatus && pendingBlockStats) {
    updateWorld(pendingStatus, pendingBlockStats);
    pendingStatus = null;
    pendingBlockStats = null;
  }
});

function clearScene() {
  blockMeshes.forEach(mesh => scene.remove(mesh));
  blockMeshes = [];
  blockMeshData.clear();
  if (turtleMesh) {
    scene.remove(turtleMesh);
    turtleMesh = null;
  }
  if (contextMenu) {
    contextMenu.remove();
    contextMenu = null;
  }
}

function renderTurtle(pos, facing, color = 0x00ff00) {
  console.log("TurtleObjLoaded:", turtleObjLoaded, "TurtleObj:", turtleObj);
  if (turtleObjLoaded && turtleObj) {
    // Create a group to center the turtle
    const group = new THREE.Group();
    const turtle = turtleObj.clone();
    // Compute bounding box to center the model
    const box = new THREE.Box3().setFromObject(turtle);
    const center = new THREE.Vector3();
    box.getCenter(center);
    turtle.position.sub(center); // Center the model at (0,0,0) in the group
    group.add(turtle);
    group.position.set(pos.x, pos.y + .5, pos.z);
    let rotY = 0;
    if (facing === 1) rotY = Math.PI;
    else if (facing === 2) rotY = Math.PI / 2;
    else if (facing === 3) rotY = 0;
    else if (facing === 4) rotY = -Math.PI / 2;
    console.log("Facing:", facing, "Rotation Y:", rotY);
    group.rotation.y = rotY + Math.PI / 2; // Adjust for model's facing direction
    scene.add(group);
    blockMeshes.push(group); // Track group for removal
  }
}

function generateWorld(blockStats) {
  // Build a map of block positions to block objects
  const blockMap = new Map();
  for (const key in blockStats) {
    const block = blockStats[key];
    if (!block || typeof block === 'string') continue;
    const match = key.match(/\(([-\d]+), ([-\d]+), ([-\d]+)\)/);
    if (match) {
      const x = parseInt(match[1]);
      const y = parseInt(match[2]);
      const z = parseInt(match[3]);
      blockMap.set(`${x},${y},${z}`, block);
    }
  }

  const directions = [
    { dx: 1, dy: 0, dz: 0, face: 'right', rot: [0, -Math.PI / 2, 0], offset: [0.5, 0, 0] },
    { dx: -1, dy: 0, dz: 0, face: 'left', rot: [0, Math.PI / 2, 0], offset: [-0.5, 0, 0] },
    { dx: 0, dy: 1, dz: 0, face: 'top', rot: [-Math.PI / 2, 0, 0], offset: [0, 0.5, 0] },
    { dx: 0, dy: -1, dz: 0, face: 'bottom', rot: [Math.PI / 2, 0, 0], offset: [0, -0.5, 0] },
    { dx: 0, dy: 0, dz: 1, face: 'front', rot: [0, 0, 0], offset: [0, 0, 0.5] },
    { dx: 0, dy: 0, dz: -1, face: 'back', rot: [0, Math.PI, 0], offset: [0, 0, -0.5] },
  ];

  for (const [key, block] of blockMap.entries()) {
    const [x, y, z] = key.split(',').map(Number);
    for (const dir of directions) {
      const nx = x + dir.dx;
      const ny = y + dir.dy;
      const nz = z + dir.dz;
      const neighbor = blockMap.get(`${nx},${ny},${nz}`);
      // Only add face if no neighbor, or neighbor is a different block type
      if (!neighbor || neighbor.name !== block.name) {
        const faceGeom = new THREE.PlaneGeometry(1, 1);
        // Load texture for this block name
        let texture = null;
        let texName = block.name ? block.name.replace(/^minecraft:/, '') : '';
        if (texName) {
          texture = new THREE.TextureLoader().load(`/static/textures/${texName}.png`, function (_) { }, function (_) { }, function (err) {
            if (err) {
              console.error(`Failed to load texture for block ${texName}:`, err);
            }
          });
          texture.magFilter = THREE.NearestFilter;
          texture.minFilter = THREE.NearestFilter;
        }
        let material;
        console.log(texture, texName);
        if (texture) {
          material = new THREE.MeshLambertMaterial({ map: texture, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
        } else {
          console.log(`No texture found for block ${texName}, using default material.`);
          material = new THREE.MeshLambertMaterial({ color: 0xaaaaaa, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
        }
        let faceMesh = new THREE.Mesh(faceGeom, material);
        faceMesh.position.set(x + dir.offset[0], y + 0.5 + dir.offset[1], z + dir.offset[2]);
        faceMesh.rotation.set(...dir.rot);
        scene.add(faceMesh);
        blockMeshes.push(faceMesh);
        blockMeshData.set(faceMesh, { x, y, z });
      }
    }
  }
}

function updateWorld(status, blockStats) {
  if (!turtleObjLoaded) {
    // Defer rendering until model is loaded
    pendingStatus = status;
    pendingBlockStats = blockStats;
    return;
  }
  clearScene();
  // Render all turtles
  if (status && status.turtles) {
    const turtles = Array.isArray(status.turtles)
      ? status.turtles
      : Object.values(status.turtles);
    turtles.forEach(turtle => {
      const isActive = status.current_turtle &&
        turtle.x === status.current_turtle.x &&
        turtle.y === status.current_turtle.y &&
        turtle.z === status.current_turtle.z;
      renderTurtle(
        { x: turtle.x, y: turtle.y, z: turtle.z },
        turtle.direction,
        isActive ? 0x00ff00 : 0xffff00 // Green for active, yellow for others
      );
    });
  } else if (status) {
    // Fallback: only one turtle
    renderTurtle({ x: status.x, y: status.y, z: status.z }, status.direction, 0x00ff00);
  }
  // renderAllBlocks(blockStats);
  generateWorld(blockStats);
}

function sendCommand(url) {
  let lastPos = null;
  fetch('/status')
    .then(r => r.json())
    .then(d => {
      lastPos = d.current_turtle ? { x: d.current_turtle.x, y: d.current_turtle.y, z: d.current_turtle.z, direction: d.current_turtle.direction } : null;
      return fetch(url, { method: 'POST' });
    })
    .then(response => response.json())
    .then(data => {
      document.getElementById('command-status').textContent = data.message || 'Command sent.';
      let attempts = 0;
      function pollStatus() {
        fetch('/status')
          .then(r => r.json())
          .then(d => {
            const newPos = d.current_turtle ? { x: d.current_turtle.x, y: d.current_turtle.y, z: d.current_turtle.z, direction: d.current_turtle.direction } : null;
            if (JSON.stringify(newPos) !== JSON.stringify(lastPos) || attempts > 9) {
              updateWorld(d, d.block_stats);
            } else {
              attempts++;
              setTimeout(pollStatus, 200);
            }
          });
      }
      pollStatus();
    })
    .catch(function () {
      document.getElementById('command-status').textContent = 'Error sending command.';
    });
}
window.sendCommand = sendCommand;

// Initial Three.js setup
scene = new THREE.Scene();
camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(5, 8, 10);
camera.lookAt(0, 0, 0);
renderer = new THREE.WebGLRenderer();
renderer.setClearColor(0x181c20);
renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById('world').appendChild(renderer.domElement);
controls = new OrbitControls(camera, renderer.domElement);
// const gridHelper = new THREE.GridHelper(20, 20);
// scene.add(gridHelper);
const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(10, 10, 10);
light.castShadow = true;
light.shadow.mapSize.width = 1024;
light.shadow.mapSize.height = 1024;
light.shadow.bias = -0.001;
light.shadow.radius = 6; // Soften shadow edges
scene.add(light);

// Add ambient light to soften overall scene shadows
const ambientLight = new THREE.AmbientLight(0xffffff, 0.35);
scene.add(ambientLight);

renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// Responsive resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Initial render
fetch('/status')
  .then(r => r.json())
  .then(d => {
    updateWorld(d, d.block_stats);
  });

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();

// Context menu for block right-click
function showContextMenu(x, y, coords) {
  if (contextMenu) contextMenu.remove();
  contextMenu = document.createElement('div');
  contextMenu.style.position = 'fixed';
  contextMenu.style.left = x + 'px';
  contextMenu.style.top = y + 'px';
  contextMenu.style.background = '#222';
  contextMenu.style.color = '#fff';
  contextMenu.style.padding = '8px 14px';
  contextMenu.style.borderRadius = '6px';
  contextMenu.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
  contextMenu.style.zIndex = 1000;
  contextMenu.textContent = `Block: (${coords.x}, ${coords.y}, ${coords.z})`;
  document.body.appendChild(contextMenu);
  // Remove on click elsewhere
  setTimeout(() => {
    window.addEventListener('mousedown', hideContextMenu, { once: true });
  }, 0);
}
function hideContextMenu() {
  if (contextMenu) {
    contextMenu.remove();
    contextMenu = null;
  }
}
// Raycaster for block picking
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
renderer.domElement.addEventListener('contextmenu', function (event) {
  event.preventDefault();
  // Get mouse position in normalized device coordinates
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(blockMeshes);
  if (intersects.length > 0) {
    const mesh = intersects[0].object;
    const coords = blockMeshData.get(mesh);
    if (coords) {
      showContextMenu(event.clientX, event.clientY, coords);
    }
  } else {
    hideContextMenu();
  }
});

// Remove the default form submit on select change
const select = document.getElementById('number');
if (select) {
  select.addEventListener('change', function (e) {
    const form = document.getElementById('turtle-form') || select.form;
    if (!form) return;
    const formData = new FormData(form);
    console.log("Form data:", Array.from(formData.entries()));
    fetch('/set_turtle', {
      method: 'POST',
      body: formData
    })
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          fetch('/status')
            .then(r => r.json())
            .then(d => {
              updateWorld(d, d.block_stats);
            });
        } else {
          alert('Failed to set turtle: ' + (data.error || 'Unknown error'));
        }
      });
  });
}
