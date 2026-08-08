import * as THREE from 'three';
import './style.css';

const TILE = 4;
const PLAYER_RADIUS = 0.55;
const PLAYER_HEIGHT = 1.65;

const level = [
  '###############',
  '#P....#.......#',
  '#.##..#..M....#',
  '#...K.#.......#',
  '###D####.######',
  '#........#....#',
  '#K####...#.H..#',
  '#......M.D....#',
  '#.######.#.####',
  '#.....S..#...X#',
  '###############',
];

type Enemy = { sprite: THREE.Sprite; health: number; alive: boolean; cooldown: number };
type Pickup = { mesh: THREE.Mesh; type: 'key' | 'heal' };

const gameRoot = document.querySelector<HTMLDivElement>('#game')!;
const overlay = document.querySelector<HTMLDivElement>('#overlay')!;
const hud = document.querySelector<HTMLDivElement>('#hud')!;
const startButton = document.querySelector<HTMLButtonElement>('#start')!;
const healthEl = document.querySelector<HTMLElement>('#health')!;
const manaEl = document.querySelector<HTMLElement>('#mana')!;
const keyEl = document.querySelector<HTMLElement>('#key-count')!;
const messageEl = document.querySelector<HTMLElement>('#message')!;
const weaponEl = document.querySelector<HTMLElement>('#weapon')!;

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

const stoneTexture = makeStoneTexture();
stoneTexture.wrapS = stoneTexture.wrapT = THREE.RepeatWrapping;
stoneTexture.magFilter = THREE.NearestFilter;
stoneTexture.minFilter = THREE.NearestMipmapLinearFilter;
const wallMaterial = new THREE.MeshStandardMaterial({ map: stoneTexture, roughness: 1, color: 0xb0a09a });
const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x403941, roughness: 1 });

const floor = new THREE.Mesh(new THREE.PlaneGeometry(level[0].length * TILE, level.length * TILE), floorMaterial);
floor.rotation.x = -Math.PI / 2;
floor.position.set((level[0].length - 1) * TILE / 2, 0, (level.length - 1) * TILE / 2);
scene.add(floor);
const ceiling = floor.clone();
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
    if (cell === 'K') addPickup(px, pz, 'key');
    if (cell === 'H') addPickup(px, pz, 'heal');
    if (cell === 'D') addDoor(px, pz, x, z);
    if (cell === 'X') addPortal(px, pz);
    if (cell === 'S') addRune(px, pz);
  }
}

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
const velocity = new THREE.Vector3();
const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();

startButton.addEventListener('click', () => {
  if (ended) location.reload();
  renderer.domElement.requestPointerLock();
});
document.addEventListener('pointerlockchange', () => {
  running = document.pointerLockElement === renderer.domElement;
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
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(TILE * 0.92, 3.4, 0.45), new THREE.MeshStandardMaterial({ color: 0x381b18, roughness: .8, metalness: .25 }));
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

function addPickup(x: number, z: number, type: 'key' | 'heal') {
  const geometry = type === 'key' ? new THREE.TorusGeometry(.36, .09, 8, 16) : new THREE.OctahedronGeometry(.48);
  const material = new THREE.MeshStandardMaterial({ color: type === 'key' ? 0xe2bd55 : 0x9c2f52, emissive: type === 'key' ? 0x6c4a08 : 0x5c1028, emissiveIntensity: 1.5 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, .75, z);
  scene.add(mesh);
  pickups.push({ mesh, type });
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
  hitEnemy(2.25, 24);
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
      else { health = Math.min(100, health + 38); mana = Math.min(5, mana + 2); showMessage('Verikristalli palauttaa voimiasi.'); }
      scene.remove(pickup.mesh);
      pickups.splice(i, 1);
      updateHud();
    }
  }
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

function makeStoneTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#50464a'; ctx.fillRect(0, 0, 64, 64);
  for (let y = 0; y < 64; y += 16) {
    const offset = (y / 16) % 2 ? 10 : 0;
    for (let x = -offset; x < 64; x += 22) {
      ctx.fillStyle = `rgb(${62 + Math.random()*20},${54 + Math.random()*16},${56 + Math.random()*18})`;
      ctx.fillRect(x + 1, y + 1, 20, 14);
      ctx.fillStyle = 'rgba(255,220,190,.08)'; ctx.fillRect(x + 2, y + 2, 18, 2);
    }
  }
  return new THREE.CanvasTexture(canvas);
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
  renderer.render(scene, camera);
}

updateHud();
animate();
