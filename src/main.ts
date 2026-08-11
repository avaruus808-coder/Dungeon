import * as THREE from 'three';
import './style.css';
import { ITEM_BY_ID, ITEMS } from './data/items';
import { Inventory } from './systems/Inventory';

const TILE = 4;
const PLAYER_RADIUS = 0.55;
const PLAYER_HEIGHT = 1.65;

const level = [
  '###############',
  '#P....#.......#',
  '#.##..#..M....#',
  '#...K.#.......#',
  '###D####.######',
  '#..W.....#....#',
  '#K####...#.H..#',
  '#......M.D....#',
  '#.######.#.####',
  '#....AS..#...X#',
  '###############',
];

type Enemy = { sprite: THREE.Sprite; health: number; alive: boolean; cooldown: number };
type Pickup = { mesh: THREE.Mesh; type: 'key' | 'item'; itemId?: string };

const gameRoot = document.querySelector<HTMLDivElement>('#game')!;
const overlay = document.querySelector<HTMLDivElement>('#overlay')!;
const hud = document.querySelector<HTMLDivElement>('#hud')!;
const startButton = document.querySelector<HTMLButtonElement>('#start')!;
const healthEl = document.querySelector<HTMLElement>('#health')!;
const manaEl = document.querySelector<HTMLElement>('#mana')!;
const keyEl = document.querySelector<HTMLElement>('#key-count')!;
const messageEl = document.querySelector<HTMLElement>('#message')!;
const weaponEl = document.querySelector<HTMLElement>('#weapon')!;
weaponEl.style.setProperty('--weapon-image', `url(${import.meta.env.BASE_URL}weapons/veil-blade.webp)`);
const minimap = document.querySelector<HTMLCanvasElement>('#minimap')!;
const minimapCtx = minimap.getContext('2d')!;
const inventoryElement = document.querySelector<HTMLDivElement>('#inventory')!;
const inventorySlotsElement = document.querySelector<HTMLDivElement>('#inventory-slots')!;
const closeInventoryButton = document.querySelector<HTMLButtonElement>('#close-inventory')!;
const detailGlyph = document.querySelector<HTMLElement>('#detail-glyph')!;
const detailName = document.querySelector<HTMLElement>('#detail-name')!;
const detailCategory = document.querySelector<HTMLElement>('#detail-category')!;
const detailDescription = document.querySelector<HTMLElement>('#detail-description')!;
const useItemButton = document.querySelector<HTMLButtonElement>('#use-item')!;
const equipItemButton = document.querySelector<HTMLButtonElement>('#equip-item')!;
const dropItemButton = document.querySelector<HTMLButtonElement>('#drop-item')!;
const equippedWeaponElement = document.querySelector<HTMLButtonElement>('#equipped-weapon')!;
const equippedArtifactElement = document.querySelector<HTMLButtonElement>('#equipped-artifact')!;
const weaponNameElement = document.querySelector<HTMLElement>('#weapon-name')!;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d0b10);
scene.fog = new THREE.FogExp2(0x100d12, 0.032);

const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.1, 120);
camera.rotation.order = 'YXZ';
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
gameRoot.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0x746579, 0x2b2020, 1.35));
const ambientLight = new THREE.AmbientLight(0x594d58, 0.72);
scene.add(ambientLight);
const playerLight = new THREE.PointLight(0xe49a6d, 4.4, 24, 1.45);
camera.add(playerLight);
scene.add(camera);

const walls: THREE.Box3[] = [];
const wallMeshes: THREE.Mesh[] = [];
const enemies: Enemy[] = [];
const pickups: Pickup[] = [];
const doors: THREE.Mesh[] = [];
let portal: THREE.Mesh | null = null;

const wallTexture = loadGameTexture('textures/ancient-tech-wall.webp');
const floorTexture = loadGameTexture('textures/ancient-tech-floor.webp', level[0].length / 2, level.length / 2);
const ceilingTexture = loadGameTexture('textures/ancient-tech-floor.webp', level[0].length / 2, level.length / 2);
const doorTexture = loadGameTexture('textures/ancient-tech-door.webp');
const wallMaterial = new THREE.MeshStandardMaterial({ map: wallTexture, roughness: .92, metalness: .08, color: 0xb8ada4 });
const floorMaterial = new THREE.MeshStandardMaterial({ map: floorTexture, roughness: .96, metalness: .04, color: 0xa9a099 });
const ceilingMaterial = new THREE.MeshStandardMaterial({ map: ceilingTexture, roughness: 1, color: 0x716a70 });
const doorMaterial = new THREE.MeshStandardMaterial({ map: doorTexture, roughness: .86, metalness: .28, color: 0xaaa099 });

const floor = new THREE.Mesh(new THREE.PlaneGeometry(level[0].length * TILE, level.length * TILE), floorMaterial);
floor.rotation.x = -Math.PI / 2;
floor.position.set((level[0].length - 1) * TILE / 2, 0, (level.length - 1) * TILE / 2);
scene.add(floor);
const ceiling = floor.clone();
ceiling.material = ceilingMaterial;
ceiling.rotation.x = Math.PI / 2;
ceiling.position.y = 3.8;
scene.add(ceiling);

for (let z = 0; z < level.length; z++) {
  for (let x = 0; x < level[z].length; x++) {
    const cell = level[z][x];
    const px = x * TILE;
    const pz = z * TILE;
    if (cell === '#') addWall(px, pz);
    if (cell === 'P') camera.position.set(px, PLAYER_HEIGHT, pz);
    if (cell === 'M') addEnemy(px, pz);
    if (cell === 'K') addKeyPickup(px, pz);
    if (cell === 'H') addItemPickup(px, pz, ITEMS.bloodCrystal.id);
    if (cell === 'W') addItemPickup(px, pz, ITEMS.boneCleaver.id);
    if (cell === 'A') addItemPickup(px, pz, ITEMS.sealedFragment.id);
    if (cell === 'D') addDoor(px, pz, x, z);
    if (cell === 'X') addPortal(px, pz);
    if (cell === 'S') addRune(px, pz);
  }
}

addAncientTechRelics();

const keys = new Set<string>();
let yaw = 0;
let pitch = 0;
let health = 100;
let mana = 5;
let keyCount = 0;
let running = false;
let ended = false;
let attackCooldown = 0;
let messageTimer = 0;
let inventoryOpen = false;
let selectedInventorySlot: number | null = null;
const inventory = new Inventory(8);
let equippedWeaponId = ITEMS.rustedBlade.id;
let equippedArtifactId: string | null = null;
const velocity = new THREE.Vector3();
const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();

startButton.addEventListener('click', () => {
  if (ended) location.reload();
  renderer.domElement.requestPointerLock();
});
document.addEventListener('pointerlockchange', () => {
  running = document.pointerLockElement === renderer.domElement;
  if (inventoryOpen) {
    overlay.classList.add('hidden');
    hud.classList.remove('hidden');
    return;
  }
  overlay.classList.toggle('hidden', running);
  hud.classList.toggle('hidden', !running && !ended);
});
document.addEventListener('mousemove', (event) => {
  if (!running) return;
  yaw -= event.movementX * 0.0022;
  pitch -= event.movementY * 0.0022;
  pitch = THREE.MathUtils.clamp(pitch, -1.35, 1.35);
});
document.addEventListener('keydown', (event) => {
  if (event.code === 'Tab' && !ended) {
    event.preventDefault();
    toggleInventory();
    return;
  }
  if (inventoryOpen) return;
  keys.add(event.code);
  if (event.code === 'KeyE' && running) interact();
});
document.addEventListener('keyup', (event) => keys.delete(event.code));
document.addEventListener('mousedown', (event) => {
  if (!running) return;
  if (event.button === 0) meleeAttack();
  if (event.button === 2) magicAttack();
});
document.addEventListener('contextmenu', (event) => event.preventDefault());
closeInventoryButton.addEventListener('click', () => closeInventory());
useItemButton.addEventListener('click', () => useSelectedItem());
equipItemButton.addEventListener('click', () => equipSelectedItem());
dropItemButton.addEventListener('click', () => dropSelectedItem());
window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

function addWall(x: number, z: number) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(TILE, 3.8, TILE), wallMaterial);
  mesh.position.set(x, 1.9, z);
  scene.add(mesh);
  wallMeshes.push(mesh);
  walls.push(new THREE.Box3().setFromObject(mesh));
}

function addDoor(x: number, z: number, gridX: number, gridZ: number) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(TILE * 0.92, 3.4, 0.45), doorMaterial);
  mesh.position.set(x, 1.7, z);
  const verticalPassage = level[gridZ - 1]?.[gridX] === '#' && level[gridZ + 1]?.[gridX] === '#';
  if (verticalPassage) mesh.rotation.y = Math.PI / 2;
  mesh.userData.closed = true;
  scene.add(mesh);
  doors.push(mesh);
  const collisionBox = new THREE.Box3().setFromObject(mesh);
  mesh.userData.collisionBox = collisionBox;
  walls.push(collisionBox);
}

function addEnemy(x: number, z: number) {
  const material = new THREE.SpriteMaterial({ map: makeEnemyTexture(), transparent: true, alphaTest: .1, color: 0xc9b8a9 });
  const sprite = new THREE.Sprite(material);
  sprite.position.set(x, 1.35, z);
  sprite.scale.set(2.4, 2.7, 1);
  scene.add(sprite);
  enemies.push({ sprite, health: 45, alive: true, cooldown: 0 });
}

function addKeyPickup(x: number, z: number) {
  const geometry = new THREE.TorusGeometry(.36, .09, 8, 16);
  const material = new THREE.MeshStandardMaterial({ color: 0xe2bd55, emissive: 0x6c4a08, emissiveIntensity: 1.5 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, .75, z);
  scene.add(mesh);
  pickups.push({ mesh, type: 'key' });
}

function addItemPickup(x: number, z: number, itemId: string) {
  const item = ITEM_BY_ID[itemId];
  const geometry = item.category === 'weapon'
    ? new THREE.BoxGeometry(.18, 1.05, .12)
    : item.category === 'artifact'
      ? new THREE.DodecahedronGeometry(.46)
      : new THREE.OctahedronGeometry(.48);
  const color = item.category === 'weapon' ? 0xc1ad87 : item.category === 'artifact' ? 0x7d55bd : 0x9c2f52;
  const emissive = item.category === 'weapon' ? 0x413622 : item.category === 'artifact' ? 0x321555 : 0x5c1028;
  const material = new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: 1.5 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, .75, z);
  if (item.category === 'weapon') mesh.rotation.z = -.6;
  scene.add(mesh);
  pickups.push({ mesh, type: 'item', itemId });
}

function addPortal(x: number, z: number) {
  const material = new THREE.MeshBasicMaterial({ color: 0x5d1ca5, side: THREE.DoubleSide, transparent: true, opacity: .82 });
  portal = new THREE.Mesh(new THREE.RingGeometry(.7, 1.45, 32), material);
  portal.position.set(x, 1.65, z);
  scene.add(portal);
  const light = new THREE.PointLight(0x7f2fff, 4, 11);
  light.position.set(x, 1.7, z);
  scene.add(light);
}

function addRune(x: number, z: number) {
  const rune = new THREE.Mesh(new THREE.CircleGeometry(1.05, 32), new THREE.MeshBasicMaterial({ color: 0x441334, transparent: true, opacity: .72 }));
  rune.rotation.x = -Math.PI / 2;
  rune.position.set(x, .015, z);
  scene.add(rune);
}

function collides(position: THREE.Vector3) {
  const box = new THREE.Box3(
    new THREE.Vector3(position.x - PLAYER_RADIUS, .05, position.z - PLAYER_RADIUS),
    new THREE.Vector3(position.x + PLAYER_RADIUS, 2.1, position.z + PLAYER_RADIUS),
  );
  return walls.some((wall) => box.intersectsBox(wall));
}

function updatePlayer(dt: number) {
  camera.rotation.set(pitch, yaw, 0);
  const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const direction = new THREE.Vector3();
  if (keys.has('KeyW')) direction.add(forward);
  if (keys.has('KeyS')) direction.sub(forward);
  if (keys.has('KeyD')) direction.add(right);
  if (keys.has('KeyA')) direction.sub(right);
  const speed = keys.has('ShiftLeft') ? 7.2 : 4.6;
  if (direction.lengthSq()) direction.normalize().multiplyScalar(speed);
  velocity.lerp(direction, Math.min(1, dt * 13));
  const nextX = camera.position.clone(); nextX.x += velocity.x * dt;
  if (!collides(nextX)) camera.position.x = nextX.x;
  const nextZ = camera.position.clone(); nextZ.z += velocity.z * dt;
  if (!collides(nextZ)) camera.position.z = nextZ.z;
  playerLight.intensity = 4.15 + Math.sin(performance.now() * .012) * .3;
}

function meleeAttack() {
  if (attackCooldown > 0) return;
  attackCooldown = .38;
  weaponEl.classList.remove('swing');
  void weaponEl.offsetWidth;
  weaponEl.classList.add('swing');
  const damage = ITEM_BY_ID[equippedWeaponId].effect?.meleeDamage ?? 24;
  hitEnemy(2.25, damage);
}

function magicAttack() {
  if (attackCooldown > 0 || mana <= 0) { if (mana <= 0) showMessage('Tyhjiövoima on ehtynyt.'); return; }
  attackCooldown = .5;
  mana--;
  updateHud();
  playerLight.color.setHex(0x843dff);
  setTimeout(() => playerLight.color.setHex(0xd17a50), 120);
  hitEnemy(12, 38);
}

function hitEnemy(range: number, damage: number) {
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  raycaster.far = range;
  const targets = enemies.filter((e) => e.alive).map((e) => e.sprite);
  const hit = raycaster.intersectObjects(targets)[0];
  if (!hit) return;
  const enemy = enemies.find((e) => e.sprite === hit.object);
  if (!enemy) return;
  enemy.health -= damage;
  enemy.sprite.material.color.setHex(0xff334f);
  setTimeout(() => enemy.alive && enemy.sprite.material.color.setHex(0xc9b8a9), 90);
  if (enemy.health <= 0) {
    enemy.alive = false;
    enemy.sprite.material.opacity = .22;
    enemy.sprite.scale.y = .5;
    enemy.sprite.position.y = .25;
    showMessage('Kryptan vartija kaatui.');
  }
}

function interact() {
  const door = doors.find((candidate) => candidate.userData.closed && candidate.position.distanceTo(camera.position) < 2.4);
  if (!door) { showMessage('Täällä ei ole mitään käytettävää.'); return; }
  if (keyCount < 1) { showMessage('Ovi vaatii rautaisen avaimen.'); return; }
  keyCount--;
  door.userData.closed = false;
  const doorBox = door.userData.collisionBox as THREE.Box3;
  if (doorBox) walls.splice(walls.indexOf(doorBox), 1);
  door.position.y = -2;
  const index = doors.indexOf(door);
  if (index >= 0) doors.splice(index, 1);
  showMessage('Lukko antaa periksi.');
  updateHud();
}

function updateEnemies(dt: number) {
  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    enemy.cooldown -= dt;
    const toPlayer = camera.position.clone().sub(enemy.sprite.position);
    toPlayer.y = 0;
    const distance = toPlayer.length();
    if (distance < 11 && distance > 1.35) {
      const next = enemy.sprite.position.clone().add(toPlayer.normalize().multiplyScalar(dt * 1.18));
      const blocked = walls.some((wall) => wall.containsPoint(new THREE.Vector3(next.x, 1, next.z)));
      if (!blocked) enemy.sprite.position.copy(next);
    }
    if (distance <= 1.55 && enemy.cooldown <= 0) {
      enemy.cooldown = 1.15;
      health = Math.max(0, health - 12);
      renderer.domElement.style.filter = 'sepia(1) saturate(3) hue-rotate(300deg)';
      setTimeout(() => renderer.domElement.style.filter = '', 120);
      updateHud();
      if (health <= 0) endGame(false);
    }
  }
}

function updatePickups(dt: number) {
  for (let i = pickups.length - 1; i >= 0; i--) {
    const pickup = pickups[i];
    pickup.mesh.rotation.y += dt * 1.7;
    pickup.mesh.position.y = .75 + Math.sin(performance.now() * .003 + i) * .12;
    if (pickup.mesh.position.distanceTo(camera.position) < 1.35) {
      if (pickup.type === 'key') { keyCount++; showMessage('Löysit rautaisen avaimen.'); }
      else {
        const itemId = pickup.itemId;
        if (!itemId) continue;
        const accepted = inventory.add(itemId);
        if (!accepted) { showMessage('Inventaario on täynnä.'); continue; }
        showMessage(`${ITEM_BY_ID[itemId].name} lisättiin inventaarioon.`);
        renderInventory();
      }
      scene.remove(pickup.mesh);
      pickups.splice(i, 1);
      updateHud();
    }
  }
}

function toggleInventory() {
  if (inventoryOpen) closeInventory();
  else openInventory();
}

function openInventory() {
  inventoryOpen = true;
  running = false;
  keys.clear();
  document.exitPointerLock();
  overlay.classList.add('hidden');
  hud.classList.remove('hidden');
  inventoryElement.classList.remove('hidden');
  renderInventory();
}

function closeInventory() {
  inventoryOpen = false;
  inventoryElement.classList.add('hidden');
  renderer.domElement.requestPointerLock();
}

function renderInventory() {
  const weapon = ITEM_BY_ID[equippedWeaponId];
  equippedWeaponElement.querySelector('strong')!.textContent = weapon.name;
  const artifact = equippedArtifactId ? ITEM_BY_ID[equippedArtifactId] : null;
  equippedArtifactElement.querySelector('strong')!.textContent = artifact?.name ?? 'Ei varustettu';
  equippedArtifactElement.classList.toggle('empty', artifact === null);
  weaponNameElement.textContent = weapon.name.toLocaleUpperCase('fi');
  inventorySlotsElement.replaceChildren();
  inventory.slots.forEach((slot, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `inventory-slot${slot ? '' : ' empty'}${selectedInventorySlot === index ? ' selected' : ''}`;
    const number = document.createElement('span');
    number.className = 'slot-number';
    number.textContent = String(index + 1).padStart(2, '0');
    button.append(number);
    if (slot) {
      const item = ITEM_BY_ID[slot.itemId];
      const glyph = document.createElement('span');
      glyph.className = 'slot-glyph';
      glyph.textContent = item.glyph;
      const name = document.createElement('span');
      name.className = 'slot-name';
      name.textContent = item.name;
      button.append(glyph, name);
      if (slot.quantity > 1) {
        const quantity = document.createElement('span');
        quantity.className = 'slot-quantity';
        quantity.textContent = String(slot.quantity);
        button.append(quantity);
      }
      button.addEventListener('click', () => {
        selectedInventorySlot = index;
        renderInventory();
        showInventoryDetails(index);
      });
    }
    inventorySlotsElement.append(button);
  });
  if (selectedInventorySlot !== null && inventory.get(selectedInventorySlot)) showInventoryDetails(selectedInventorySlot);
  else clearInventoryDetails();
}

function showInventoryDetails(index: number) {
  const slot = inventory.get(index);
  if (!slot) return;
  const item = ITEM_BY_ID[slot.itemId];
  detailGlyph.textContent = item.glyph;
  detailName.textContent = item.name;
  detailCategory.textContent = item.category.toLocaleUpperCase('fi');
  detailDescription.textContent = item.description;
  useItemButton.disabled = item.category !== 'consumable';
  equipItemButton.disabled = item.equipSlot === undefined;
  dropItemButton.disabled = false;
}

function clearInventoryDetails() {
  selectedInventorySlot = null;
  detailGlyph.textContent = '—';
  detailName.textContent = 'Valitse esine';
  detailCategory.textContent = 'TYHJÄ';
  detailDescription.textContent = 'Kerää luolastosta esineitä ja tarkastele niitä täällä.';
  useItemButton.disabled = true;
  equipItemButton.disabled = true;
  dropItemButton.disabled = true;
}

function useSelectedItem() {
  if (selectedInventorySlot === null) return;
  const slot = inventory.get(selectedInventorySlot);
  if (!slot) return;
  const item = ITEM_BY_ID[slot.itemId];
  if (item.category !== 'consumable' || !item.effect) return;
  const healthGain = Math.min(item.effect.health ?? 0, 100 - health);
  const manaGain = Math.min(item.effect.mana ?? 0, 5 - mana);
  if (healthGain === 0 && manaGain === 0) {
    inventoryStatus('Voimasi ovat jo täydet.');
    return;
  }
  health += healthGain;
  mana += manaGain;
  inventory.remove(selectedInventorySlot, 1);
  updateHud();
  renderInventory();
  inventoryStatus(`${item.name}: +${healthGain} elinvoimaa, +${manaGain} tyhjiövoimaa.`);
}

function equipSelectedItem() {
  if (selectedInventorySlot === null) return;
  const slot = inventory.get(selectedInventorySlot);
  if (!slot) return;
  const item = ITEM_BY_ID[slot.itemId];
  if (!item.equipSlot) return;
  const removed = inventory.removeAll(selectedInventorySlot);
  if (!removed) return;
  const previousItemId = item.equipSlot === 'weapon' ? equippedWeaponId : equippedArtifactId;
  if (item.equipSlot === 'weapon') equippedWeaponId = item.id;
  else equippedArtifactId = item.id;
  if (previousItemId) inventory.add(previousItemId);
  renderInventory();
  inventoryStatus(`${item.name} varustettu.`);
}

function dropSelectedItem() {
  if (selectedInventorySlot === null) return;
  const removed = inventory.remove(selectedInventorySlot, 1);
  if (!removed) return;
  const forwardX = -Math.sin(yaw);
  const forwardZ = -Math.cos(yaw);
  const dropX = camera.position.x + forwardX * 1.45;
  const dropZ = camera.position.z + forwardZ * 1.45;
  addItemPickup(dropX, dropZ, removed.itemId);
  renderInventory();
  inventoryStatus(`${ITEM_BY_ID[removed.itemId].name} pudotettu.`);
}

function inventoryStatus(text: string) {
  detailDescription.textContent = text;
}

function showMessage(text: string) {
  messageEl.textContent = text;
  messageEl.classList.add('show');
  messageTimer = 2.4;
}

function updateHud() {
  healthEl.textContent = String(health);
  manaEl.textContent = String(mana);
  keyEl.textContent = String(keyCount);
}

function drawMinimap() {
  const width = minimap.width;
  const height = minimap.height;
  const centerX = width / 2;
  const centerY = height * .72;
  const pixelsPerWorldUnit = 6.4;
  const scanRange = TILE * 4.35;
  const forward = new THREE.Vector2(-Math.sin(yaw), -Math.cos(yaw));
  const right = new THREE.Vector2(Math.cos(yaw), -Math.sin(yaw));

  minimapCtx.clearRect(0, 0, width, height);
  const vignette = minimapCtx.createRadialGradient(centerX, centerY, 10, centerX, centerY, Math.max(width, height) * .65);
  vignette.addColorStop(0, 'rgba(42, 35, 40, .86)');
  vignette.addColorStop(.72, 'rgba(14, 12, 16, .72)');
  vignette.addColorStop(1, 'rgba(4, 3, 6, 0)');
  minimapCtx.fillStyle = vignette;
  minimapCtx.fillRect(0, 0, width, height);

  const toScreen = (worldX: number, worldZ: number) => {
    const dx = worldX - camera.position.x;
    const dz = worldZ - camera.position.z;
    const sideDistance = dx * right.x + dz * right.y;
    const forwardDistance = dx * forward.x + dz * forward.y;
    return {
      x: centerX + sideDistance * pixelsPerWorldUnit,
      y: centerY - forwardDistance * pixelsPerWorldUnit,
    };
  };

  for (let gridZ = 0; gridZ < level.length; gridZ++) {
    for (let gridX = 0; gridX < level[gridZ].length; gridX++) {
      const worldX = gridX * TILE;
      const worldZ = gridZ * TILE;
      const dx = worldX - camera.position.x;
      const dz = worldZ - camera.position.z;
      const distance = Math.hypot(dx, dz);
      const forwardDistance = dx * forward.x + dz * forward.y;
      if (distance > scanRange || forwardDistance < -TILE * 1.15) continue;

      const fade = THREE.MathUtils.clamp(1 - distance / scanRange, .12, .78);
      minimapCtx.beginPath();
      for (let corner = 0; corner < 4; corner++) {
        const cornerX = worldX + (corner === 0 || corner === 3 ? -TILE / 2 : TILE / 2);
        const cornerZ = worldZ + (corner < 2 ? -TILE / 2 : TILE / 2);
        const point = toScreen(cornerX, cornerZ);
        if (corner === 0) minimapCtx.moveTo(point.x, point.y);
        else minimapCtx.lineTo(point.x, point.y);
      }
      minimapCtx.closePath();
      if (level[gridZ][gridX] === '#') {
        minimapCtx.fillStyle = `rgba(165, 149, 138, ${fade})`;
        minimapCtx.fill();
        minimapCtx.strokeStyle = `rgba(215, 195, 174, ${fade * .55})`;
        minimapCtx.lineWidth = 1;
        minimapCtx.stroke();
      } else {
        minimapCtx.fillStyle = `rgba(57, 49, 55, ${fade * .68})`;
        minimapCtx.fill();
      }
    }
  }

  minimapCtx.save();
  minimapCtx.translate(centerX, centerY);
  minimapCtx.fillStyle = '#d8c7a4';
  minimapCtx.shadowColor = '#d8c7a4';
  minimapCtx.shadowBlur = 5;
  minimapCtx.beginPath();
  minimapCtx.moveTo(0, -11);
  minimapCtx.lineTo(7, 7);
  minimapCtx.lineTo(0, 3);
  minimapCtx.lineTo(-7, 7);
  minimapCtx.closePath();
  minimapCtx.fill();
  minimapCtx.restore();
}

function endGame(victory: boolean) {
  ended = true;
  running = false;
  document.exitPointerLock();
  hud.classList.add('hidden');
  overlay.classList.remove('hidden');
  overlay.querySelector('.eyebrow')!.textContent = victory ? 'PORTTI ON AVATTU' : 'SYVYYDET OTTIVAT SINUT';
  overlay.querySelector('h1')!.textContent = victory ? 'TOINEN PUOLI' : 'KUOLEMA';
  document.querySelector('#intro')!.textContent = victory
    ? 'Kiven takana ei ollutkaan maan sisus, vaan tähtitaivas, jota yksikään ihminen ei ollut nimennyt. Ensimmäinen ulottuvuus odottaa.'
    : 'Luolasto muistaa jokaisen sinne jääneen. Seuraava laskeutuminen ei tule olemaan samanlainen.';
  startButton.textContent = 'ALOITA UUDELLEEN';
}

function loadGameTexture(path: string, repeatX = 1, repeatY = 1) {
  const texture = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}${path}`);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return texture;
}

function addAncientTechRelics() {
  addDeadDisplay(12, 1.82, 2.03, 0);
  addDeadDisplay(21.97, 1.58, 8, -Math.PI / 2);
  addCableBundle(18.2, 1.5, 2.08, 0);
  addCableBundle(21.92, 1.3, 11.2, -Math.PI / 2);
}

function addDeadDisplay(x: number, y: number, z: number, rotationY: number) {
  const group = new THREE.Group();
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(1.45, .88, .13),
    new THREE.MeshStandardMaterial({ color: 0x302c2a, roughness: .74, metalness: .72 }),
  );
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(1.08, .5),
    new THREE.MeshStandardMaterial({ color: 0x050607, roughness: .28, metalness: .48, emissive: 0x0b0809, emissiveIntensity: .16 }),
  );
  screen.position.z = .071;
  const led = new THREE.Mesh(
    new THREE.CircleGeometry(.025, 8),
    new THREE.MeshBasicMaterial({ color: 0x9a401d }),
  );
  led.position.set(.55, -.33, .073);
  group.add(frame, screen, led);
  group.position.set(x, y, z);
  group.rotation.y = rotationY;
  scene.add(group);

  const standbyGlow = new THREE.PointLight(0x9a3a18, .32, 2.5, 2);
  standbyGlow.position.set(x, y - .2, z);
  scene.add(standbyGlow);
}

function addCableBundle(x: number, y: number, z: number, rotationY: number) {
  const group = new THREE.Group();
  const colors = [0x351e26, 0x26322f, 0x2d2522];
  for (let cable = 0; cable < 3; cable++) {
    const offset = (cable - 1) * .1;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-.72, .46 + offset, .04),
      new THREE.Vector3(-.28, .18 + offset, .07),
      new THREE.Vector3(.12, .22 + offset, .09),
      new THREE.Vector3(.72, -.42 + offset, .05),
    ]);
    const mesh = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 14, .025, 5, false),
      new THREE.MeshStandardMaterial({ color: colors[cable], roughness: .82, metalness: .18 }),
    );
    group.add(mesh);
  }
  group.position.set(x, y, z);
  group.rotation.y = rotationY;
  scene.add(group);
}

function makeEnemyTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 96;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#21141b'; ctx.beginPath(); ctx.ellipse(48, 56, 29, 37, 0, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#755359'; ctx.beginPath(); ctx.moveTo(23, 34); ctx.lineTo(8, 8); ctx.lineTo(38, 25); ctx.fill(); ctx.beginPath(); ctx.moveTo(73, 34); ctx.lineTo(88, 8); ctx.lineTo(58, 25); ctx.fill();
  ctx.fillStyle = '#c63342'; ctx.fillRect(31, 44, 10, 7); ctx.fillRect(56, 44, 10, 7);
  ctx.fillStyle = '#eee0b8'; ctx.fillRect(34, 45, 3, 3); ctx.fillRect(59, 45, 3, 3);
  ctx.fillStyle = '#a69079'; for (let i=0;i<5;i++) ctx.fillRect(35+i*6, 68+(i%2)*3, 4, 9);
  return new THREE.CanvasTexture(canvas);
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), .05);
  if (running && !ended) {
    attackCooldown -= dt;
    updatePlayer(dt);
    updateEnemies(dt);
    updatePickups(dt);
    if (portal) {
      portal.rotation.z += dt * .35;
      const distance = portal.position.distanceTo(camera.position);
      if (distance < 1.3) endGame(true);
    }
    if (messageTimer > 0) {
      messageTimer -= dt;
      if (messageTimer <= 0) messageEl.classList.remove('show');
    }
  }
  drawMinimap();
  renderer.render(scene, camera);
}

updateHud();
animate();
