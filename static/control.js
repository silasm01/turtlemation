import * as THREE from 'https://threejsfundamentals.org/threejs/resources/threejs/r122/build/three.module.js';
import { OrbitControls } from 'https://threejsfundamentals.org/threejs/resources/threejs/r122/examples/jsm/controls/OrbitControls.js';

let scene, camera, renderer, controls;
let turtleMesh = null;
let blockMeshes = [];
let blockMeshData = new Map(); // Map mesh to {x, y, z}
let contextMenu = null;

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

function renderTurtle(pos, facing) {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshLambertMaterial({ color: 0x00ff00 });
  turtleMesh = new THREE.Mesh(geometry, material);
  turtleMesh.position.set(pos.x, pos.y + 0.5, pos.z);
  let rotY = 0;
  if (facing === 1) rotY = 0;
  else if (facing === 2) rotY = Math.PI / 2;
  else if (facing === 3) rotY = Math.PI;
  else if (facing === 4) rotY = -Math.PI / 2;
  turtleMesh.rotation.y = rotY;
  scene.add(turtleMesh);
}

function renderBlock(x, y, z, block) {
  if (!block || typeof block === 'string') return;
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  let color = 0xaaaaaa;
  if (block.name && block.name.includes('leaves')) color = 0x228B22;
  else if (block.name && block.name.includes('dirt')) color = 0x8B4513;
  else if (block.name && block.name.includes('stone')) color = 0x888888;
  else if (block.name && block.name.includes('water')) color = 0x3399ff;
  else if (block.name && block.name.includes('wood')) color = 0xdeb887;
  else if (block.name && block.name.includes('sand')) color = 0xFFFACD;
  else if (block.name && block.name.includes('gravel')) color = 0xA9A9A9;
  else if (block.name && block.name.includes('glass')) color = 0x87CEEB;
  else if (block.name && block.name.includes('planks')) color = 0xDEB887;
  else if (block.name && block.name.includes('log')) color = 0x8B5A2B;
  else if (block.name && block.name.includes('wool')) color = 0xFFFFFF;
  else if (block.name && block.name.includes('coal')) color = 0x222222;
  else if (block.name && block.name.includes('iron')) color = 0xD8D8D8;
  else if (block.name && block.name.includes('gold')) color = 0xFFD700;
  else if (block.name && block.name.includes('diamond')) color = 0x00FFFF;
  else if (block.name && block.name.includes('redstone')) color = 0xFF0000;
  else if (block.name && block.name.includes('lapis')) color = 0x0000FF;
  else if (block.name && block.name.includes('emerald')) color = 0x50C878;
  const material = new THREE.MeshLambertMaterial({ color });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y + 0.5, z);
  scene.add(mesh);
  blockMeshes.push(mesh);
  blockMeshData.set(mesh, { x, y, z });
}

function renderAllBlocks(blockStats) {
  for (const key in blockStats) {
    const block = blockStats[key];
    const match = key.match(/\(([-\d]+), ([-\d]+), ([-\d]+)\)/);
    if (match) {
      const x = parseInt(match[1]);
      const y = parseInt(match[2]);
      const z = parseInt(match[3]);
      renderBlock(x, y, z, block);
    }
  }
}

function updateWorld(status, blockStats) {
  clearScene();
  if (status) renderTurtle({ x: status.x, y: status.y, z: status.z }, status.direction);
  renderAllBlocks(blockStats);
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
              updateWorld(d.current_turtle, d.block_stats);
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
const gridHelper = new THREE.GridHelper(20, 20);
scene.add(gridHelper);
const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(10, 10, 10);
scene.add(light);

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
    updateWorld(d.current_turtle, d.block_stats);
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
