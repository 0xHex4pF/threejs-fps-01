// The fighters: boxy dockworkers with team colours, built once from shared geometry
// and materials. Each fighter has two shootable parts — head and torso — whose
// userData names the fighter and the part, so one raycast resolves any hit. The
// player is a fighter too, but first-person: their body is two invisible hitboxes
// that follow the camera, so bots shoot at a real body, not a probability.
import * as THREE from 'three';
import { PALETTE, CONFIG } from './config.js';

const geometries = {
  torso: new THREE.BoxGeometry(0.52, 0.62, 0.3),
  head: new THREE.BoxGeometry(0.3, 0.32, 0.3),
  visor: new THREE.BoxGeometry(0.26, 0.09, 0.04),
  leg: new THREE.BoxGeometry(0.17, 0.75, 0.2),
  arm: new THREE.BoxGeometry(0.5, 0.13, 0.14),
  gun: new THREE.BoxGeometry(0.09, 0.11, 0.6),
  pack: new THREE.BoxGeometry(0.36, 0.42, 0.14),
};

const materials = {};
function material(name, color, extra = {}) {
  if (!materials[name]) {
    materials[name] = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.85, metalness: 0.05, ...extra });
  }
  return materials[name];
}

function buildBody(team) {
  const teamColor = team === 'warden' ? PALETTE.warden : PALETTE.jackal;
  const darkColor = team === 'warden' ? PALETTE.wardenDark : PALETTE.jackalDark;
  const group = new THREE.Group();
  const torso = new THREE.Mesh(geometries.torso, material(`${team}Body`, teamColor));
  torso.position.y = 1.06;
  const head = new THREE.Mesh(geometries.head, material('skin', PALETTE.skin));
  head.position.y = 1.56;
  const visor = new THREE.Mesh(geometries.visor, material('visor', darkColor, { emissive: new THREE.Color(teamColor), emissiveIntensity: 0.5 }));
  visor.position.set(0, 1.58, -0.16);
  const legL = new THREE.Mesh(geometries.leg, material('legs', PALETTE.darkSteel));
  legL.position.set(-0.12, 0.375, 0);
  const legR = new THREE.Mesh(geometries.leg, material('legs', PALETTE.darkSteel));
  legR.position.set(0.12, 0.375, 0);
  const arms = new THREE.Mesh(geometries.arm, material(`${team}Arms`, darkColor));
  arms.position.set(0, 1.22, -0.18);
  const gun = new THREE.Mesh(geometries.gun, material('gun', PALETTE.gunmetal));
  gun.position.set(0.12, 1.28, -0.42);
  const pack = new THREE.Mesh(geometries.pack, material('pack', PALETTE.darkSteel));
  pack.position.set(0, 1.1, 0.22);
  for (const mesh of [torso, head, visor, legL, legR, arms, gun, pack]) {
    mesh.castShadow = true;
    group.add(mesh);
  }
  return { group, torso, head, legL, legR, gun };
}

export function createFighter(scene, team, name) {
  const parts = buildBody(team);
  scene.add(parts.group);
  const fighter = {
    team,
    name,
    group: parts.group,
    headMesh: parts.head,
    torsoMesh: parts.torso,
    legL: parts.legL,
    legR: parts.legR,
    gunMesh: parts.gun,
    position: parts.group.position,
    yaw: 0,
    hp: CONFIG.botHealth,
    maxHp: CONFIG.botHealth,
    armor: false,
    alive: true,
    deathTime: 0,
    moveSpeed: 0,
    walkPhase: 0,
    isPlayer: false,
    hidden: false, // the first-person player's body is never drawn
    hitMeshes: [parts.head, parts.torso],
  };
  parts.head.userData.fighter = fighter;
  parts.head.userData.part = 'head';
  parts.torso.userData.fighter = fighter;
  parts.torso.userData.part = 'body';
  return fighter;
}

// Invisible hitboxes for the first-person player: material.visible false skips the
// draw but the meshes still answer raycasts, so bots hit a real body.
export function createPlayerHitboxes(scene, fighter) {
  const hidden = new THREE.MeshBasicMaterial({ visible: false });
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.36, 0.34), hidden);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.9, 0.36), hidden);
  head.userData.fighter = fighter;
  head.userData.part = 'head';
  body.userData.fighter = fighter;
  body.userData.part = 'body';
  scene.add(head, body);
  fighter.hitMeshes = [head, body];
  return {
    update(position, eye, height) {
      head.position.set(position.x, position.y + eye + 0.12, position.z);
      body.position.set(position.x, position.y + height * 0.55, position.z);
    },
    remove() {
      scene.remove(head, body);
    },
  };
}

// Walk swing, idle sway and the fall on death. Purely visual: the simulation never
// reads anything this writes.
export function stepFighterVisual(fighter, dt, time) {
  const group = fighter.group;
  if (!fighter.alive) {
    const fallen = Math.min(1, (time - fighter.deathTime) / 0.4);
    group.rotation.x = -fallen * Math.PI * 0.48;
    group.position.y = -fallen * 0.25;
    return;
  }
  group.rotation.y = fighter.yaw;
  if (fighter.moveSpeed > 0.3) {
    fighter.walkPhase += dt * fighter.moveSpeed * 1.6;
    const swing = Math.sin(fighter.walkPhase) * 0.5;
    fighter.legL.rotation.x = swing;
    fighter.legR.rotation.x = -swing;
    group.position.y = Math.abs(Math.cos(fighter.walkPhase)) * 0.03;
  } else {
    fighter.legL.rotation.x *= 0.8;
    fighter.legR.rotation.x *= 0.8;
    group.position.y = 0;
  }
}

export function resetFighter(fighter, x, z, yaw) {
  fighter.position.set(x, 0, z);
  fighter.yaw = yaw;
  fighter.hp = fighter.maxHp;
  fighter.alive = true;
  fighter.deathTime = 0;
  fighter.moveSpeed = 0;
  fighter.group.rotation.x = 0;
  fighter.group.rotation.y = yaw;
  // A hidden fighter (the first-person player) stays hidden through respawns:
  // its visor sits centimetres from the camera and would fill the frame.
  fighter.group.visible = !fighter.hidden;
}

export function killFighter(fighter, time) {
  fighter.alive = false;
  fighter.hp = 0;
  fighter.deathTime = time;
  fighter.moveSpeed = 0;
}
