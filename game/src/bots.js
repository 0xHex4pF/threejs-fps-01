// Bot brains: a small state machine over the waypoint graph. Attackers (Jackals)
// push a lane toward the uplink pad and hold it; defenders (Wardens) walk to a hold
// post and guard a lane. Every bot perceives on a stagger, reacts after a delay,
// fires in bursts with spread, strafes while engaged, hunts the last place it saw
// or heard an enemy, and turns on whoever damages it. Perception is a real
// line-of-sight ray against the world, never a gift.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { resetFighter } from './actors.js';

const eye = new THREE.Vector3();
const chest = new THREE.Vector3();
const toTarget = new THREE.Vector3();
const forward = new THREE.Vector3();
const moveDir = new THREE.Vector3();

export function nearestNode(waypoints, x, z) {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < waypoints.length; i += 1) {
    const dx = waypoints[i].x - x;
    const dz = waypoints[i].z - z;
    const d = dx * dx + dz * dz;
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

// Breadth-first route over the waypoint links. Returns node ids, start excluded.
export function findRoute(waypoints, from, to) {
  if (from === to) return [to];
  const prev = new Array(waypoints.length).fill(-1);
  const queue = [from];
  prev[from] = from;
  while (queue.length) {
    const node = queue.shift();
    for (const link of waypoints[node].links) {
      if (prev[link] !== -1) continue;
      prev[link] = node;
      if (link === to) {
        const route = [to];
        let walk = to;
        while (walk !== from) {
          walk = prev[walk];
          route.unshift(walk);
        }
        return route.slice(1);
      }
      queue.push(link);
    }
  }
  return [to];
}

export function createBot(fighter, role, rng) {
  return {
    fighter,
    role, // 'attack' pushes the pad, 'defend' holds a post
    mode: 'advance',
    route: [],
    routeIndex: 0,
    leg: 0,
    holdNode: -1,
    holdUntil: 0,
    scanBase: 0,
    target: null,
    lastKnown: new THREE.Vector3(),
    loseTimer: 0,
    reactUntil: 0,
    burstLeft: 0,
    nextShotAt: 0,
    strafeDir: 1,
    strafeUntil: 0,
    perceiveAt: rng.range(0, 0.12),
    stuckAt: 0,
    stuckX: 0,
    stuckZ: 0,
    muzzleUntil: 0,
    rng,
  };
}

function faceToward(bot, tx, tz, dt, rate) {
  const dx = tx - bot.fighter.position.x;
  const dz = tz - bot.fighter.position.z;
  const want = Math.atan2(-dx, -dz);
  let diff = want - bot.fighter.yaw;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const step = Math.max(-rate * dt, Math.min(rate * dt, diff));
  bot.fighter.yaw += step;
}

function planObjective(bot, ctx) {
  const fighter = bot.fighter;
  const from = nearestNode(ctx.waypoints, fighter.position.x, fighter.position.z);
  if (bot.role === 'attack') {
    // First leg: a random lane entry, so the three attackers split up. Then the pad.
    const lane = bot.rng.pick([9, 10, 11]);
    bot.route = findRoute(ctx.waypoints, from, lane).concat(findRoute(ctx.waypoints, lane, 6));
    bot.leg = 0;
  } else {
    const holds = ctx.waypoints.filter((node) => node.hold);
    const post = holds[bot.rng.int(0, holds.length - 1)];
    bot.holdNode = post.id;
    bot.route = findRoute(ctx.waypoints, from, post.id);
  }
  bot.routeIndex = 0;
  bot.mode = 'advance';
}

export function resetBot(bot, ctx, spawn) {
  resetFighter(bot.fighter, spawn.x, spawn.z, spawn.yaw);
  bot.target = null;
  bot.loseTimer = 0;
  bot.burstLeft = 0;
  bot.mode = 'advance';
  planObjective(bot, ctx);
}

function canSee(bot, enemy, ctx) {
  const fighter = bot.fighter;
  eye.set(fighter.position.x, fighter.position.y + CONFIG.botEye, fighter.position.z);
  chest.set(enemy.position.x, enemy.position.y + 1.2, enemy.position.z);
  toTarget.subVectors(chest, eye);
  const distance = toTarget.length();
  if (distance > CONFIG.botViewRange) return false;
  toTarget.divideScalar(distance || 1);
  forward.set(-Math.sin(fighter.yaw), 0, -Math.cos(fighter.yaw));
  const facing = forward.x * toTarget.x + forward.z * toTarget.z;
  if (facing < Math.cos(CONFIG.botViewHalfAngle)) return false;
  return !ctx.collision.segmentBlocked(eye, chest, ctx.worldShootables);
}

function perceive(bot, ctx) {
  const fighter = bot.fighter;
  let best = null;
  let bestDist = Infinity;
  for (const other of ctx.actors) {
    if (!other.alive || other.team === fighter.team) continue;
    const dx = other.position.x - fighter.position.x;
    const dz = other.position.z - fighter.position.z;
    const d = dx * dx + dz * dz;
    if (d >= bestDist) continue;
    if (canSee(bot, other, ctx)) {
      best = other;
      bestDist = d;
    }
  }
  if (best) {
    if (bot.target !== best) {
      bot.target = best;
      bot.reactUntil = ctx.now + bot.rng.range(CONFIG.botReactMin, CONFIG.botReactMax);
      bot.burstLeft = 0;
    }
    bot.lastKnown.copy(best.position);
    bot.loseTimer = 0;
    bot.mode = 'engage';
  } else if (bot.target) {
    bot.loseTimer += 0.12;
    if (bot.loseTimer > CONFIG.botLoseSightTime) {
      bot.target = null;
      bot.mode = 'hunt';
      const from = nearestNode(ctx.waypoints, fighter.position.x, fighter.position.z);
      const goal = nearestNode(ctx.waypoints, bot.lastKnown.x, bot.lastKnown.z);
      bot.route = findRoute(ctx.waypoints, from, goal);
      bot.routeIndex = 0;
      bot.holdUntil = 0;
    }
  }
}

function shootAt(bot, ctx) {
  const fighter = bot.fighter;
  const target = bot.target;
  eye.set(fighter.position.x, fighter.position.y + CONFIG.botEye, fighter.position.z);
  // A headshot roll aims at the head; whether it lands there is decided by the
  // raycast against the real head mesh, and resolveShot applies the multiplier.
  const headshot = bot.rng.chance(CONFIG.botHeadshotChance);
  chest.set(target.position.x, target.position.y + (headshot ? 1.56 : 1.2), target.position.z);
  toTarget.subVectors(chest, eye);
  const distance = toTarget.length();
  toTarget.divideScalar(distance || 1);
  const spread = CONFIG.botSpreadNear + (Math.min(distance, 34) / 34) * (CONFIG.botSpreadFar - CONFIG.botSpreadNear);
  toTarget.x += bot.rng.range(-spread, spread);
  toTarget.y += bot.rng.range(-spread, spread);
  toTarget.z += bot.rng.range(-spread, spread);
  toTarget.normalize();
  ctx.resolveShot(eye, toTarget, fighter, {
    damage: bot.rng.range(CONFIG.botDamageMin, CONFIG.botDamageMax),
    headMult: CONFIG.botHeadshotMult,
    falloffNear: 10,
    falloffFar: 34,
  });
  bot.muzzleUntil = ctx.now + 0.05;
  ctx.onShotFired(fighter);
}

function moveToward(bot, tx, tz, dt, ctx, speed) {
  const fighter = bot.fighter;
  moveDir.set(tx - fighter.position.x, 0, tz - fighter.position.z);
  const distance = moveDir.length();
  if (distance < 0.05) return true;
  moveDir.divideScalar(distance);
  const step = Math.min(distance, speed * dt);
  ctx.collision.slideMove(fighter.position, moveDir.x * step, moveDir.z * step, CONFIG.botRadius, 1.7);
  faceToward(bot, tx, tz, dt, 5);
  fighter.moveSpeed = speed;
  return distance <= 0.8;
}

function followRoute(bot, dt, ctx) {
  const fighter = bot.fighter;
  if (bot.routeIndex >= bot.route.length) return true;
  const node = ctx.waypoints[bot.route[bot.routeIndex]];
  if (moveToward(bot, node.x, node.z, dt, ctx, CONFIG.botSpeed)) bot.routeIndex += 1;
  // Stuck against a wall or a teammate: skip the node rather than grind on it.
  if (ctx.now - bot.stuckAt > 1.2) {
    const moved = Math.hypot(fighter.position.x - bot.stuckX, fighter.position.z - bot.stuckZ);
    if (moved < 0.25) bot.routeIndex += 1;
    bot.stuckAt = ctx.now;
    bot.stuckX = fighter.position.x;
    bot.stuckZ = fighter.position.z;
  }
  return bot.routeIndex >= bot.route.length;
}

export function stepBot(bot, dt, ctx) {
  const fighter = bot.fighter;
  if (!fighter.alive) {
    fighter.moveSpeed = 0;
    return;
  }
  fighter.moveSpeed = 0;

  if (ctx.now >= bot.perceiveAt) {
    bot.perceiveAt = ctx.now + 0.12;
    perceive(bot, ctx);
  }

  if (bot.mode === 'engage' && bot.target) {
    const target = bot.target;
    if (!target.alive) {
      bot.target = null;
      bot.mode = 'hunt';
      return;
    }
    faceToward(bot, target.position.x, target.position.z, dt, 6);
    // Strafe across the target's view; flip on a timer or when blocked.
    if (ctx.now > bot.strafeUntil) {
      bot.strafeDir = bot.rng.chance(0.5) ? 1 : -1;
      bot.strafeUntil = ctx.now + bot.rng.range(0.7, 1.4);
    }
    const sideX = Math.cos(fighter.yaw) * bot.strafeDir;
    const sideZ = -Math.sin(fighter.yaw) * bot.strafeDir;
    const blocked = ctx.collision.slideMove(
      fighter.position,
      sideX * CONFIG.botStrafeSpeed * dt,
      sideZ * CONFIG.botStrafeSpeed * dt,
      CONFIG.botRadius,
      1.7,
    );
    if (blocked) bot.strafeUntil = 0;
    fighter.moveSpeed = CONFIG.botStrafeSpeed;
    if (ctx.now >= bot.reactUntil && canSee(bot, target, ctx)) {
      if (bot.burstLeft <= 0) {
        bot.burstLeft = bot.rng.int(CONFIG.botBurstMin, CONFIG.botBurstMax);
        bot.nextShotAt = ctx.now + bot.rng.range(CONFIG.botBurstPauseMin, CONFIG.botBurstPauseMax) * 0.4;
      } else if (ctx.now >= bot.nextShotAt) {
        shootAt(bot, ctx);
        bot.burstLeft -= 1;
        bot.nextShotAt = ctx.now + CONFIG.botShotGap;
      }
    }
    return;
  }

  if (bot.mode === 'hunt') {
    if (followRoute(bot, dt, ctx)) {
      if (bot.holdUntil === 0) bot.holdUntil = ctx.now + 2;
      fighter.yaw += Math.sin(ctx.now * 1.4) * dt * 0.9;
      if (ctx.now > bot.holdUntil) planObjective(bot, ctx);
    }
    return;
  }

  if (bot.mode === 'hold') {
    fighter.yaw = bot.scanBase + Math.sin(ctx.now * 0.5) * 0.6;
    return;
  }

  // Advance: walk the route; arriving at a hold post or the pad ends in hold.
  if (followRoute(bot, dt, ctx)) {
    bot.mode = 'hold';
    bot.scanBase = fighter.yaw;
    if (bot.role === 'attack') {
      // Face the Warden side from the pad.
      bot.scanBase = Math.PI;
      fighter.yaw = Math.PI;
    }
  }
}

// A shot cracked nearby: turn toward it and go look, unless already fighting.
export function botHear(bot, position, ctx) {
  const fighter = bot.fighter;
  if (!fighter.alive || bot.mode === 'engage') return;
  const dx = position.x - fighter.position.x;
  const dz = position.z - fighter.position.z;
  if (dx * dx + dz * dz > CONFIG.botHearRange * CONFIG.botHearRange) return;
  bot.lastKnown.copy(position);
  bot.mode = 'hunt';
  const from = nearestNode(ctx.waypoints, fighter.position.x, fighter.position.z);
  const goal = nearestNode(ctx.waypoints, position.x, position.z);
  bot.route = findRoute(ctx.waypoints, from, goal);
  bot.routeIndex = 0;
  bot.holdUntil = 0;
}

// Damage is a perfect tell: the bot knows exactly who shot it.
export function botDamaged(bot, attacker, ctx) {
  const fighter = bot.fighter;
  if (!fighter.alive || !attacker || !attacker.alive) return;
  bot.target = attacker;
  bot.lastKnown.copy(attacker.position);
  bot.reactUntil = ctx.now + 0.25;
  bot.burstLeft = 0;
  bot.mode = 'engage';
}
