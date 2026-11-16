// Last Light Quay: boot, the fixed-step simulation, and the match state machine.
// One state object (S) holds the match; the modules own their own pieces and main
// wires them together. The simulation steps at a fixed 60 Hz, apart from rendering;
// the frame loop only syncs the camera, steps visuals and pushes numbers to the HUD.
// A debug handle, window.__game, exposes the state and a few test helpers so the
// game can be play-tested without a mouse; it changes nothing about play.
import * as THREE from 'three';
import { CONFIG, WEAPONS, WEAPON_ORDER, PALETTE } from './config.js';
import { makeRng } from './random.js';
import { createAudio } from './audio.js';
import { createInput } from './input.js';
import { createCollision } from './collide.js';
import { createWorld } from './world.js';
import { createFighter, createPlayerHitboxes, stepFighterVisual, resetFighter, killFighter } from './actors.js';
import { createBot, resetBot, stepBot, botHear, botDamaged } from './bots.js';
import { createWeapons } from './weapons.js';
import { createGrenades } from './grenades.js';
import { createEffects } from './effects.js';
import { createHud } from './hud.js';
import { stageShot } from './shots.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;
const rng = makeRng(shotName ? seed : (Date.now() % 2147483647));

// --- Renderer, scene, camera ----------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.sky);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.fog), 30, 75);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

// --- World and modules ------------------------------------------------------------
const world = createWorld(scene);
const collision = createCollision(world.colliders);
const audio = createAudio();
const effects = createEffects(scene);

// --- State: the whole match in one place -------------------------------------------
const S = {
  phase: 'title', // title | buy | live | roundEnd | matchEnd
  ui: 'title', // title | buy | pause | end | null (playing)
  paused: false,
  time: 0,
  round: 1,
  wins: { warden: 0, jackal: 0 },
  roundTimeLeft: CONFIG.roundTime,
  buyTimeLeft: CONFIG.buyTime,
  roundEndLeft: 0,
  uplink: 0,
  uplinkContested: false,
  money: CONFIG.startMoney,
  kills: 0,
  deaths: 0,
  shotsFired: 0,
  shotsHit: 0,
  grenades: 1,
  pitch: 0,
  shake: 0,
  prevFiring: false,
  freeCamera: false,
  pendingPlay: false,
  matchStarted: false,
  frame: {},
  strafeLean: 0,
};

// --- Fighters -----------------------------------------------------------------------
const player = createFighter(scene, 'warden', 'You');
player.isPlayer = true;
player.hidden = true;
player.group.visible = false;
player.velocity = new THREE.Vector3();
player.onGround = true;
player.crouching = false;
player.eye = CONFIG.standEye;
player.height = CONFIG.standHeight;
const playerHitboxes = createPlayerHitboxes(scene, player);

const actors = [player];
const bots = [];
const wardenNames = ['Warden-1', 'Warden-2'];
const jackalNames = ['Jackal-1', 'Jackal-2', 'Jackal-3'];
for (let i = 0; i < CONFIG.teammateCount; i += 1) {
  const fighter = createFighter(scene, 'warden', wardenNames[i]);
  actors.push(fighter);
  bots.push(createBot(fighter, 'defend', rng));
}
for (let i = 0; i < CONFIG.enemyCount; i += 1) {
  const fighter = createFighter(scene, 'jackal', jackalNames[i]);
  actors.push(fighter);
  bots.push(createBot(fighter, 'attack', rng));
}
const botByFighter = new Map(bots.map((bot) => [bot.fighter, bot]));

// Raycast targets: the world plus every living fighter's hit meshes. Rebuilt on
// spawn and on death, never per frame.
let shootTargets = [];
function rebuildTargets() {
  shootTargets = world.shootables.slice();
  for (const actor of actors) {
    if (actor.alive) shootTargets.push(...actor.hitMeshes);
  }
}
rebuildTargets();

// Park everyone at the spawn lines before the first match, so the title screen
// sits over the quay with the squads in place instead of a pile at the origin.
{
  const wardenSpawns = world.spawns.warden;
  const jackalSpawns = world.spawns.jackal;
  resetFighter(player, wardenSpawns[0].x, wardenSpawns[0].z, wardenSpawns[0].yaw);
  playerHitboxes.update(player.position, player.eye, player.height);
  let wardenIndex = 1;
  let jackalIndex = 0;
  for (const bot of bots) {
    const spawn = bot.fighter.team === 'warden' ? wardenSpawns[wardenIndex++] : jackalSpawns[jackalIndex++];
    resetFighter(bot.fighter, spawn.x, spawn.z, spawn.yaw);
  }
}

const weapons = createWeapons(camera, audio);
const grenades = createGrenades(scene, collision, (position) => explodeGrenade(position));

// Reused temporaries: the hot paths allocate nothing.
const tmpDir = new THREE.Vector3();
const tmpFrom = new THREE.Vector3();
const tmpTo = new THREE.Vector3();
const tmpVel = new THREE.Vector3();
const tmpEye = new THREE.Vector3();
const tmpChest = new THREE.Vector3();

// --- HUD and input -------------------------------------------------------------------
const hud = createHud({
  onPlay() {
    audio.unlock();
    // No pointer lock here: startRound opens the buy menu unlocked, and the
    // click that closes the menu is what locks the pointer.
    startMatch();
  },
  onBuy(id) {
    audio.unlock();
    buyItem(id);
  },
  onCloseBuy() {
    audio.unlock();
    closeBuyMenu();
  },
  onResume() {
    audio.unlock();
    requestPlay();
  },
  onQuit() {
    quitToTitle();
  },
  onRestart() {
    audio.unlock();
    startMatch();
  },
});

const input = createInput(renderer.domElement, (locked) => {
  if (locked) {
    S.pendingPlay = false;
    // Only the pause screen clears on lock: the buy menu must survive a lock
    // granted from an earlier click, or the shop would vanish on match start.
    if (S.ui === 'pause') {
      S.paused = false;
      S.ui = null;
      hud.showScreen(null);
    }
  } else if (!shotName && S.ui === null && (S.phase === 'buy' || S.phase === 'live' || S.phase === 'roundEnd')) {
    // The pointer escaped mid-match: pause rather than leave the player blind.
    S.paused = true;
    S.ui = 'pause';
    hud.showScreen('pause');
  }
});

function requestPlay() {
  S.pendingPlay = true;
  input.requestLock();
  // Headless and gesture-less environments may never grant the lock; the pause
  // screen stays up and the player clicks again. Nothing is lost either way.
}

function canBuy() {
  if (!player.alive) return false;
  if (S.phase === 'buy') return true;
  return S.phase === 'live' && S.roundTimeLeft > CONFIG.roundTime - CONFIG.buyWindow;
}

function openBuyMenu() {
  if (!canBuy()) return;
  S.ui = 'buy';
  hud.showScreen('buy');
  hud.updateBuyMenu(S.money, weapons.state.owned, player.armor, S.grenades);
  input.releaseLock();
}

function closeBuyMenu() {
  S.ui = null;
  hud.showScreen(null);
  if (S.phase === 'buy' || S.phase === 'live') requestPlay();
}

function buyItem(id) {
  const prices = { armor: CONFIG.armorPrice, grenade: CONFIG.grenadePrice, ammo: CONFIG.ammoPrice };
  if (WEAPONS[id]) {
    if (weapons.state.owned.has(id) || S.money < WEAPONS[id].price) {
      audio.denied();
      return;
    }
    S.money -= WEAPONS[id].price;
    weapons.buyWeapon(id);
  } else if (id === 'armor') {
    if (player.armor || S.money < prices.armor) {
      audio.denied();
      return;
    }
    S.money -= prices.armor;
    player.armor = true;
  } else if (id === 'grenade') {
    if (S.grenades >= 3 || S.money < prices.grenade) {
      audio.denied();
      return;
    }
    S.money -= prices.grenade;
    S.grenades += 1;
  } else if (id === 'ammo') {
    if (S.money < prices.ammo) {
      audio.denied();
      return;
    }
    S.money -= prices.ammo;
    weapons.refillAmmo();
  }
  audio.buy();
  hud.updateBuyMenu(S.money, weapons.state.owned, player.armor, S.grenades);
}

// --- Shooting -------------------------------------------------------------------------
// One raycast resolves any shot: the first living body or world surface wins.
// Damage falls off with distance and multiplies on a head hit.
function resolveShot(from, dir, shooter, opts) {
  const hit = collision.rayHit(from, dir, 120, shootTargets);
  if (!hit) return null;
  const fighter = hit.object.userData.fighter;
  if (fighter && fighter !== shooter && fighter.alive) {
    const part = hit.object.userData.part;
    const distance = hit.distance;
    const falloff = distance <= opts.falloffNear ? 1 : Math.max(0.5, 1 - (distance - opts.falloffNear) / (opts.falloffFar - opts.falloffNear) * 0.5);
    const amount = opts.damage * falloff * (part === 'head' ? opts.headMult : 1);
    return { fighter, part, point: hit.point, distance, amount };
  }
  return { fighter: null, part: null, point: hit.point, distance: hit.distance, amount: 0 };
}

function applyDamage(victim, amount, attacker, part) {
  if (!victim.alive) return;
  let dealt = amount;
  if (victim.armor) dealt *= CONFIG.armorReduction;
  victim.hp -= dealt;
  if (victim === player) {
    hud.damageFlash();
    audio.hurt();
    S.shake = Math.min(1, S.shake + 0.35);
  }
  if (victim.hp <= 0) {
    killFighter(victim, S.time);
    rebuildTargets();
    if (attacker && attacker !== victim) {
      hud.killfeed(`${attacker.name} ▸ ${victim.name}`, attacker.team === 'warden');
      if (attacker === player) {
        S.kills += 1;
        S.money = Math.min(CONFIG.moneyCap, S.money + CONFIG.killReward);
        audio.kill();
      }
    }
    if (victim === player) S.deaths += 1;
    const bot = botByFighter.get(victim);
    if (bot) bot.target = null;
  } else if (attacker) {
    const bot = botByFighter.get(victim);
    if (bot) botDamaged(bot, attacker, botContext());
  }
}

function firePlayerWeapon() {
  const def = weapons.def();
  const triggerEdge = input.state.firing && !S.prevFiring;
  const result = weapons.pullTrigger(triggerEdge);
  if (result !== 'fired') return;
  S.shotsFired += 1;
  const speed = Math.hypot(player.velocity.x, player.velocity.z);
  let spread = weapons.spread(speed);
  if (!player.onGround) spread *= 1.8;
  if (player.crouching) spread *= 0.7;
  camera.getWorldDirection(tmpDir);
  let anyHit = false;
  weapons.muzzleWorld(tmpFrom);
  for (let pellet = 0; pellet < def.pellets; pellet += 1) {
    tmpTo.copy(tmpDir);
    tmpTo.x += rng.range(-spread, spread);
    tmpTo.y += rng.range(-spread, spread);
    tmpTo.z += rng.range(-spread, spread);
    tmpTo.normalize();
    camera.getWorldPosition(tmpEye);
    const hit = resolveShot(tmpEye, tmpTo, player, {
      damage: def.damage, headMult: def.headMult, falloffNear: def.falloffNear, falloffFar: def.falloffFar,
    });
    if (hit) {
      effects.spawnTracer(tmpFrom, hit.point);
      if (hit.fighter) {
        anyHit = true;
        const killed = hit.fighter.hp - hit.amount <= 0;
        applyDamage(hit.fighter, hit.amount, player, hit.part);
        hud.hitMarker(killed, killed ? 160 : 90);
        audio.hit();
      } else {
        effects.spawnSpark(hit.point);
      }
    } else {
      tmpChest.copy(tmpEye).addScaledVector(tmpTo, 80);
      effects.spawnTracer(tmpFrom, tmpChest);
    }
  }
  if (anyHit) S.shotsHit += 1;
  // Recoil: the camera climbs a little and wanders, so bursts walk upward.
  S.pitch = Math.min(1.45, S.pitch + def.kick * 0.22 + rng.range(0, 0.004));
  player.yaw += rng.range(-0.004, 0.004);
  alertBots(player.position, player.team);
}

function alertBots(position, team) {
  for (const bot of bots) {
    if (bot.fighter.team !== team) botHear(bot, position, botContext());
  }
}

function explodeGrenade(position) {
  audio.explosion();
  const dx = position.x - player.position.x;
  const dz = position.z - player.position.z;
  const playerDist = Math.hypot(dx, dz);
  if (playerDist < 12) S.shake = Math.min(1.2, S.shake + (1 - playerDist / 12) * 0.8);
  for (const actor of actors) {
    if (!actor.alive) continue;
    tmpChest.set(actor.position.x, actor.position.y + 1.2, actor.position.z);
    const distance = tmpChest.distanceTo(position);
    if (distance > CONFIG.grenadeRadius) continue;
    const blocked = collision.segmentBlocked(position, tmpChest, world.shootables);
    let damage = CONFIG.grenadeDamage * (1 - (distance / CONFIG.grenadeRadius) * 0.7);
    if (blocked) damage *= 0.25;
    applyDamage(actor, damage, player, 'body');
  }
  alertBots(position, 'warden');
}

// --- Bots -----------------------------------------------------------------------------
function botContext() {
  return {
    now: S.time,
    actors,
    collision,
    worldShootables: world.shootables,
    waypoints: world.waypoints,
    rng,
    resolveShot: (from, dir, shooter, opts) => {
      const hit = resolveShot(from, dir, shooter, opts);
      effects.spawnTracer(from, hit ? hit.point : tmpChest.copy(from).addScaledVector(dir, 40));
      if (hit && hit.fighter) {
        applyDamage(hit.fighter, hit.amount, shooter, hit.part);
      } else if (hit) {
        effects.spawnSpark(hit.point);
      }
      return hit;
    },
    onShotFired: (shooter) => {
      if (shooter.team !== 'warden') {
        const d = Math.hypot(shooter.position.x - player.position.x, shooter.position.z - player.position.z);
        if (d < 30) audio.enemyShoot();
      }
      alertBots(shooter.position, shooter.team);
    },
  };
}

// --- Player movement ----------------------------------------------------------------------
function stepPlayer(dt) {
  const keys = input.state.keys;
  const crouching = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
  if (crouching && !player.crouching) {
    player.crouching = true;
    player.height = CONFIG.crouchHeight;
  } else if (!crouching && player.crouching
    && !collision.overlaps(player.position.x, player.position.y, player.position.z, CONFIG.playerRadius, CONFIG.standHeight, 0.02)) {
    player.crouching = false;
    player.height = CONFIG.standHeight;
  }
  const eyeTarget = player.crouching ? CONFIG.crouchEye : CONFIG.standEye;
  player.eye += (eyeTarget - player.eye) * Math.min(1, dt * 12);

  const forwardInput = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
  const strafeInput = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
  const sin = Math.sin(player.yaw);
  const cos = Math.cos(player.yaw);
  tmpVel.set(0, 0, 0);
  if (forwardInput || strafeInput) {
    tmpVel.set(-sin * forwardInput + cos * strafeInput, 0, -cos * forwardInput - sin * strafeInput).normalize();
  }
  const speed = player.crouching ? CONFIG.crouchSpeed : CONFIG.walkSpeed;
  const blend = Math.min(1, (player.onGround ? CONFIG.groundAccel : CONFIG.airAccel) * dt / speed);
  player.velocity.x += (tmpVel.x * speed - player.velocity.x) * blend;
  player.velocity.z += (tmpVel.z * speed - player.velocity.z) * blend;
  if (player.onGround && !tmpVel.lengthSq()) {
    const damp = Math.max(0, 1 - CONFIG.friction * dt);
    player.velocity.x *= damp;
    player.velocity.z *= damp;
  }
  S.strafeLean += ((strafeInput * -0.014) - S.strafeLean) * Math.min(1, dt * 8);

  if (keys.has('Space') && player.onGround) {
    player.velocity.y = CONFIG.jumpSpeed;
    player.onGround = false;
  }
  player.velocity.y -= CONFIG.gravity * dt;

  collision.slideMove(player.position, player.velocity.x * dt, player.velocity.z * dt, CONFIG.playerRadius, player.height);
  player.position.y += player.velocity.y * dt;
  player.onGround = false;
  const hit = collision.overlaps(player.position.x, player.position.y, player.position.z, CONFIG.playerRadius, player.height, 0);
  if (hit && player.velocity.y <= 0) {
    player.position.y = hit.max.y;
    player.velocity.y = 0;
    player.onGround = true;
  } else if (hit) {
    player.position.y = hit.min.y - player.height;
    player.velocity.y = 0;
  }
  if (player.position.y < 0) {
    player.position.y = 0;
    player.velocity.y = 0;
    player.onGround = true;
  }
  player.velocity.y = Math.max(-30, player.velocity.y);
  playerHitboxes.update(player.position, player.eye, player.height);
}

// Push living fighters apart so nobody stands inside a teammate.
function separateActors() {
  for (let i = 0; i < actors.length; i += 1) {
    for (let j = i + 1; j < actors.length; j += 1) {
      const a = actors[i];
      const b = actors[j];
      if (!a.alive || !b.alive) continue;
      const dx = b.position.x - a.position.x;
      const dz = b.position.z - a.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.001 && dist < 0.7) {
        const push = (0.7 - dist) / 2;
        const nx = dx / dist;
        const nz = dz / dist;
        collision.slideMove(a.position, -nx * push, -nz * push, CONFIG.playerRadius, 1.7);
        collision.slideMove(b.position, nx * push, nz * push, CONFIG.playerRadius, 1.7);
      }
    }
  }
}

// --- Rounds and the match --------------------------------------------------------------------
function countAlive(team) {
  let count = 0;
  for (const actor of actors) if (actor.alive && actor.team === team) count += 1;
  return count;
}

function startRound() {
  S.roundTimeLeft = CONFIG.roundTime;
  S.buyTimeLeft = CONFIG.buyTime;
  S.roundEndLeft = 0;
  S.uplink = 0;
  S.uplinkContested = false;
  S.phase = 'buy';
  S.freeCamera = false;
  // Respawn: the player takes the middle Warden spawn, bots take the rest.
  const wardenSpawns = world.spawns.warden;
  const jackalSpawns = world.spawns.jackal;
  resetFighter(player, wardenSpawns[0].x, wardenSpawns[0].z, wardenSpawns[0].yaw);
  player.velocity.set(0, 0, 0);
  player.eye = CONFIG.standEye;
  player.height = CONFIG.standHeight;
  player.crouching = false;
  S.pitch = 0;
  playerHitboxes.update(player.position, player.eye, player.height);
  let wardenIndex = 1;
  let jackalIndex = 0;
  const ctx = botContext();
  for (const bot of bots) {
    const spawn = bot.fighter.team === 'warden' ? wardenSpawns[wardenIndex++] : jackalSpawns[jackalIndex++];
    resetBot(bot, ctx, spawn);
  }
  weapons.refillAmmo();
  grenades.clear();
  rebuildTargets();
  hud.hideBanner();
  hud.showScreen('buy');
  hud.updateBuyMenu(S.money, weapons.state.owned, player.armor, S.grenades);
  S.ui = 'buy';
  input.releaseLock();
}

function startMatch() {
  S.wins.warden = 0;
  S.wins.jackal = 0;
  S.round = 1;
  S.money = CONFIG.startMoney;
  S.kills = 0;
  S.deaths = 0;
  S.shotsFired = 0;
  S.shotsHit = 0;
  S.grenades = 1;
  player.armor = false;
  weapons.resetMatch();
  S.matchStarted = true;
  startRound();
}

function endRound(winner, reason) {
  if (S.phase !== 'live') return;
  S.phase = 'roundEnd';
  S.roundEndLeft = CONFIG.roundEndPause;
  S.wins[winner] += 1;
  const playerWon = winner === 'warden';
  S.money = Math.min(CONFIG.moneyCap, S.money + (playerWon ? CONFIG.winReward : CONFIG.lossReward));
  if (playerWon) audio.roundWin();
  else audio.roundLose();
  hud.showBanner(
    playerWon ? 'Round won' : 'Round lost',
    `${reason} — Wardens ${S.wins.warden}, Jackals ${S.wins.jackal}`,
    playerWon,
    CONFIG.roundEndPause * 1000,
  );
  if (S.ui === 'buy') {
    S.ui = null;
    hud.showScreen(null);
  }
  grenades.clear();
}

function showEndScreen(won, copy) {
  S.phase = 'matchEnd';
  S.ui = 'end';
  input.releaseLock();
  const accuracy = S.shotsFired ? Math.round((S.shotsHit / S.shotsFired) * 100) : 0;
  hud.showEnd(won, copy, [
    ['Final score', `Wardens ${S.wins.warden} — ${S.wins.jackal} Jackals`],
    ['Rounds played', S.round],
    ['Eliminations', S.kills],
    ['Deaths', S.deaths],
    ['Accuracy', `${accuracy}%`],
    ['Money banked', `$${S.money}`],
  ]);
  hud.showScreen('end');
}

function quitToTitle() {
  S.phase = 'title';
  S.ui = 'title';
  S.paused = false;
  S.matchStarted = false;
  hud.hideBanner();
  hud.showScreen('title');
  input.releaseLock();
  // Park the camera at the spawn line so the title sits over the quay.
  resetFighter(player, world.spawns.warden[0].x, world.spawns.warden[0].z, 0);
  player.velocity.set(0, 0, 0);
  S.pitch = 0;
  playerHitboxes.update(player.position, player.eye, player.height);
}

function stepUplink(dt) {
  const pad = world.pad;
  let jackals = 0;
  let wardens = 0;
  for (const actor of actors) {
    if (!actor.alive) continue;
    if (Math.abs(actor.position.x - pad.x) < pad.half && Math.abs(actor.position.z - pad.z) < pad.half) {
      if (actor.team === 'jackal') jackals += 1;
      else wardens += 1;
    }
  }
  const capturing = jackals > 0 && wardens === 0;
  if (capturing) {
    if (!S.uplinkContested) audio.uplink();
    S.uplink = Math.min(1, S.uplink + dt / CONFIG.uplinkCaptureTime);
  } else if (jackals === 0) {
    S.uplink = Math.max(0, S.uplink - dt / CONFIG.uplinkDecayTime);
  }
  S.uplinkContested = capturing;
  if (S.uplink >= 1) endRound('jackal', 'The uplink was captured');
}

// --- The fixed step -----------------------------------------------------------------------------
function step(dt) {
  S.time += dt;
  if (S.phase === 'buy') {
    S.buyTimeLeft -= dt;
    weapons.step(dt, 0, S.time);
    if (S.buyTimeLeft <= 0) {
      S.phase = 'live';
      if (S.ui === 'buy') closeBuyMenu();
      hud.setHint(`<kbd>B</kbd> buy menu — closes in ${CONFIG.buyWindow}s`);
    }
    return;
  }
  if (S.phase === 'roundEnd') {
    S.roundEndLeft -= dt;
    weapons.step(dt, 0, S.time);
    if (S.roundEndLeft <= 0) {
      if (S.wins.warden >= CONFIG.roundsToWin || S.wins.jackal >= CONFIG.roundsToWin) {
        const won = S.wins.warden >= CONFIG.roundsToWin;
        showEndScreen(won, won
          ? 'The Jackals never took the pad. The quay stays lit.'
          : 'The Jackals took the quay. Run it back.');
      } else {
        S.round += 1;
        startRound();
      }
    }
    return;
  }
  if (S.phase !== 'live') return;

  S.roundTimeLeft -= dt;
  const look = input.takeLook();
  player.yaw -= look.x * 0.0022;
  S.pitch = Math.max(-1.45, Math.min(1.45, S.pitch - look.y * 0.0022));

  if (player.alive) {
    stepPlayer(dt);
    // Edge-triggered actions, consumed once per frame by the frame loop's snapshot.
    if (S.frame.reload) weapons.reload();
    if (S.frame.grenade && S.grenades > 0) {
      S.grenades -= 1;
      camera.getWorldDirection(tmpDir);
      camera.getWorldPosition(tmpFrom);
      tmpFrom.addScaledVector(tmpDir, 0.5);
      tmpFrom.y -= 0.1;
      grenades.throwGrenade(tmpFrom, tmpDir);
      audio.grenadeThrow();
    }
    if (S.frame.weapon) weapons.equip(S.frame.weapon);
    if (input.state.firing) firePlayerWeapon();
  }
  S.prevFiring = input.state.firing;

  const speed = Math.hypot(player.velocity.x, player.velocity.z);
  weapons.step(dt, speed, S.time);

  const ctx = botContext();
  for (const bot of bots) stepBot(bot, dt, ctx);
  separateActors();
  grenades.step(dt);
  stepUplink(dt);

  // Round end by elimination or by the clock.
  if (S.phase === 'live') {
    if (countAlive('jackal') === 0) endRound('warden', 'All Jackals eliminated');
    else if (countAlive('warden') === 0) endRound('jackal', 'The Wardens are down');
    else if (S.roundTimeLeft <= 0) endRound('warden', 'Time expired — the pad held');
  }
}

// --- Frame loop ----------------------------------------------------------------------------------
let lastTime = performance.now();
let accumulator = 0;

function syncCamera() {
  if (S.freeCamera) return;
  camera.position.set(player.position.x, player.position.y + player.eye, player.position.z);
  const shakeX = S.shake > 0 ? rng.range(-S.shake, S.shake) * 0.02 : 0;
  const shakeY = S.shake > 0 ? rng.range(-S.shake, S.shake) * 0.02 : 0;
  camera.rotation.set(S.pitch + shakeX, player.yaw + shakeY, S.strafeLean, 'YXZ');
}

function refreshHud() {
  hud.setHealth(player.hp, player.armor);
  const def = weapons.def();
  const slot = weapons.ammo[weapons.state.current];
  hud.setAmmo(slot.mag, slot.reserve, def.name, S.grenades);
  hud.setMoney(S.money);
  hud.setScore(S.wins.warden, S.wins.jackal, S.round);
  hud.setAlive(countAlive('warden'), countAlive('jackal'));
  hud.setUplink(S.uplink, S.uplinkContested);
  if (S.phase === 'buy') hud.setTimer(S.buyTimeLeft, 'buy');
  else hud.setTimer(Math.max(0, S.roundTimeLeft), 'live');
  if (!player.alive && S.phase === 'live') hud.setHint('You are down — your squad fights on.');
  else if (S.uplinkContested) hud.setHint('Jackals are capturing the uplink — clear the pad!');
  else if (S.phase === 'live' && S.roundTimeLeft > CONFIG.roundTime - CONFIG.buyWindow) hud.setHint('<kbd>B</kbd> buy menu');
  else hud.setHint('');
  hud.update(performance.now());
}

function frame(now) {
  requestAnimationFrame(frame);
  const frameDt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  S.shake = Math.max(0, S.shake - frameDt * 2.2);

  // Frame-level keys: UI toggles and one-shot actions, read once per frame.
  const actions = {};
  if (input.wasPressed('KeyM')) {
    hud.setMuted(audio.toggleMute());
  }
  if (input.wasPressed('KeyP')) {
    if (S.ui === 'pause') requestPlay();
    else if (input.state.locked) input.releaseLock();
  }
  if (input.wasPressed('KeyB') && S.matchStarted && !shotName) {
    if (S.ui === 'buy') closeBuyMenu();
    else if (S.ui === null) openBuyMenu();
  }
  if (S.ui === 'buy') {
    const buyIds = ['scatter', 'carbine', 'marksman', 'armor', 'grenade', 'ammo'];
    for (let i = 0; i < buyIds.length; i += 1) {
      if (input.wasPressed(`Digit${i + 1}`)) buyItem(buyIds[i]);
    }
  } else if (S.ui === null && S.phase === 'live' && player.alive) {
    for (let i = 0; i < WEAPON_ORDER.length; i += 1) {
      if (input.wasPressed(`Digit${i + 1}`)) actions.weapon = WEAPON_ORDER[i];
    }
    const wheel = input.takeWheel();
    if (wheel !== 0) {
      const owned = WEAPON_ORDER.filter((id) => weapons.state.owned.has(id));
      const at = owned.indexOf(weapons.state.current);
      actions.weapon = owned[(at + (wheel > 0 ? 1 : -1) + owned.length) % owned.length];
    }
    if (input.wasPressed('KeyR')) actions.reload = true;
    if (input.wasPressed('KeyG')) actions.grenade = true;
  }
  S.frame = actions;

  if (!S.paused) {
    accumulator += frameDt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
      // One-shot actions fire on the first substep only.
      S.frame = {};
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
  }
  input.clearPressed();

  for (const actor of actors) {
    if (!actor.isPlayer) stepFighterVisual(actor, frameDt, S.time);
  }
  world.animate(now / 1000);
  world.setUplinkGlow(S.uplink, S.uplinkContested);
  effects.step(frameDt);
  syncCamera();
  refreshHud();
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Shot mode and the debug handle ---------------------------------------------------------------
function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

// The staging API shots.js uses: the same functions live play uses, driven directly.
const shotApi = {
  S,
  hud,
  weapons,
  camera,
  actors,
  bots,
  startMatch,
  stepFixed(count) {
    for (let i = 0; i < count; i += 1) {
      // Staging runs before any render, so no matrix has been updated yet:
      // raycasts (bot sight, shots) need fresh world matrices every step.
      scene.updateMatrixWorld(true);
      step(FIXED_STEP);
    }
    for (const actor of actors) {
      if (!actor.isPlayer) stepFighterVisual(actor, FIXED_STEP, S.time);
    }
    syncCamera();
    refreshHud();
  },
  setPlayer(x, z, yaw, pitch) {
    resetFighter(player, x, z, yaw);
    player.velocity.set(0, 0, 0);
    S.pitch = pitch;
    playerHitboxes.update(player.position, player.eye, player.height);
  },
  aimPlayerAt(x, y, z) {
    const dx = x - player.position.x;
    const dy = y - (player.position.y + player.eye);
    const dz = z - player.position.z;
    const length = Math.hypot(dx, dy, dz) || 1;
    player.yaw = Math.atan2(-dx, -dz);
    S.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  },
  placeFighter(fighter, x, z, yaw) {
    resetFighter(fighter, x, z, yaw);
  },
  setWins(w, j) {
    S.wins.warden = w;
    S.wins.jackal = j;
  },
  setRound(n) {
    S.round = n;
  },
  setTimerLeft(seconds) {
    S.roundTimeLeft = seconds;
  },
  setUplink(value) {
    S.uplink = value;
  },
  setMoney(n) {
    S.money = n;
  },
  giveWeapon(id) {
    weapons.buyWeapon(id);
  },
  setGrenades(n) {
    S.grenades = n;
  },
  setKills(n) {
    S.kills = n;
  },
  setDeaths(n) {
    S.deaths = n;
  },
  setShots(fired, hit) {
    S.shotsFired = fired;
    S.shotsHit = hit;
  },
  beginLive() {
    S.phase = 'live';
    S.ui = null;
    hud.showScreen(null);
  },
  openBuyMenu() {
    S.ui = 'buy';
    hud.showScreen('buy');
    hud.updateBuyMenu(S.money, weapons.state.owned, player.armor, S.grenades);
  },
  firePlayerAt(x, y, z) {
    // One real carbine round down a zero-spread ray: ammo, tracer, spark or
    // hitmarker all come from the live code path.
    scene.updateMatrixWorld(true);
    weapons.pullTrigger(true);
    camera.getWorldDirection(tmpDir);
    tmpTo.set(x - camera.position.x, y - camera.position.y, z - camera.position.z).normalize();
    camera.getWorldPosition(tmpEye);
    weapons.muzzleWorld(tmpFrom);
    const def = weapons.def();
    const hit = resolveShot(tmpEye, tmpTo, player, {
      damage: def.damage, headMult: def.headMult, falloffNear: def.falloffNear, falloffFar: def.falloffFar,
    });
    if (hit) {
      effects.spawnTracer(tmpFrom, hit.point);
      if (hit.fighter) {
        applyDamage(hit.fighter, hit.amount, player, hit.part);
        hud.hitMarker(false, 4000);
        S.shotsHit += 1;
      } else {
        effects.spawnSpark(hit.point);
      }
    }
    S.shotsFired += 1;
    weapons.step(0, 0, S.time);
    refreshHud();
  },
  showEndScreen(won, copy) {
    showEndScreen(won, copy);
  },
  setCameraFree(x, y, z, yaw, pitch) {
    S.freeCamera = true;
    camera.position.set(x, y, z);
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
  },
};

// Debug and play-test handle: state plus a few honest helpers. It ships in the
// game and changes nothing about play.
window.__game = {
  state: S,
  actors,
  bots,
  version: 'last-light-quay-1.0.0',
  startMatch,
  endRound,
  setMoney(n) {
    S.money = n;
  },
  giveWeapon(id) {
    weapons.buyWeapon(id);
  },
  teleport(x, z) {
    player.position.set(x, 0, z);
    player.velocity.set(0, 0, 0);
    playerHitboxes.update(player.position, player.eye, player.height);
  },
  setUplink(value) {
    S.uplink = value;
  },
};

if (shotName) {
  stageShot(shotName, shotApi);
  syncCamera();
  refreshHud();
  paintTwiceThenReady();
} else {
  hud.showScreen('title');
  requestAnimationFrame(frame);
}
