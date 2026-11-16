// Last Light Quay — every tuning number lives here, in one place, so the simulation
// modules never disagree about a value. Amounts are dollars, times are seconds,
// distances are metres, angles are radians.
export const CONFIG = {
  // Match and rounds.
  roundsToWin: 5,
  roundTime: 90,
  buyTime: 10,
  buyWindow: 15, // seconds into a live round during which B still opens the shop
  roundEndPause: 3.5,
  uplinkCaptureTime: 8,
  uplinkDecayTime: 12,

  // Economy.
  startMoney: 800,
  killReward: 300,
  winReward: 1200,
  lossReward: 600,
  moneyCap: 9000,
  armorPrice: 500,
  grenadePrice: 300,
  ammoPrice: 200,

  // The player body.
  playerRadius: 0.34,
  standHeight: 1.72,
  crouchHeight: 1.12,
  standEye: 1.6,
  crouchEye: 1.02,
  walkSpeed: 5.2,
  crouchSpeed: 2.4,
  groundAccel: 42,
  airAccel: 9,
  friction: 9,
  gravity: 20,
  jumpSpeed: 6.2,
  playerHealth: 100,
  armorReduction: 0.5, // damage multiplier while armor holds

  // Bots: 2 teammates, 3 opponents. Reaction and spread keep them beatable.
  teammateCount: 2,
  enemyCount: 3,
  botHealth: 100,
  botSpeed: 4.2,
  botStrafeSpeed: 2.6,
  botRadius: 0.34,
  botEye: 1.52,
  botViewRange: 34,
  botViewHalfAngle: 0.96, // ~55 degrees each side
  botReactMin: 0.4,
  botReactMax: 0.7,
  botDamageMin: 9,
  botDamageMax: 14,
  botHeadshotChance: 0.08,
  botHeadshotMult: 2.2,
  botBurstMin: 3,
  botBurstMax: 5,
  botShotGap: 0.11,
  botBurstPauseMin: 0.5,
  botBurstPauseMax: 0.9,
  botSpreadNear: 0.012,
  botSpreadFar: 0.032,
  botLoseSightTime: 2.5,
  botHearRange: 25,

  // Grenades.
  grenadeFuse: 2.2,
  grenadeRadius: 6,
  grenadeDamage: 85,
  grenadeThrowSpeed: 13,
  grenadeBounce: 0.45,

  // The uplink pad (the objective beyond killing).
  uplink: { x: 0, z: -2, half: 2.2 },
};

// Dusk at a container port: deep blue air, amber lamps, painted steel.
export const PALETTE = {
  sky: 0x232c44,
  fog: 0x2a3550,
  ground: 0x3a3f47,
  groundLine: 0x565d68,
  teal: 0x2e7f7a,
  rust: 0xb0562f,
  mustard: 0xc99a2e,
  slate: 0x5a6b7a,
  darkSteel: 0x2b3138,
  crate: 0x8a6b45,
  barrel: 0x7a3b2e,
  lamp: 0xf2a33c,
  padGlow: 0x35c4d8,
  warden: 0x35c4d8,
  wardenDark: 0x1e6f7c,
  jackal: 0xe8703a,
  jackalDark: 0x8a3f1d,
  skin: 0xc9a184,
  gunmetal: 0x23272d,
  ink: 0xece7dd,
  muted: 0x9aa3ad,
  water: 0x16283e,
};

// The buy menu's stock. damage is per bullet at close range; falloff runs from
// falloffNear (full damage) to falloffFar (half damage). pellets > 1 is a spread gun.
export const WEAPONS = {
  p9: {
    id: 'p9', name: 'P9 Sidearm', price: 0, damage: 22, headMult: 2.2,
    mag: 12, reserve: 48, fireGap: 0.16, auto: false, reloadTime: 1.3,
    spreadStill: 0.004, spreadMove: 0.02, pellets: 1, falloffNear: 12, falloffFar: 30, kick: 0.03,
  },
  scatter: {
    id: 'scatter', name: 'Marauder Scattergun', price: 900, damage: 9, headMult: 1.6,
    mag: 6, reserve: 24, fireGap: 0.75, auto: false, reloadTime: 2.4,
    spreadStill: 0.045, spreadMove: 0.06, pellets: 8, falloffNear: 6, falloffFar: 16, kick: 0.09,
  },
  carbine: {
    id: 'carbine', name: 'Kestrel-7 Carbine', price: 2100, damage: 26, headMult: 2.2,
    mag: 30, reserve: 90, fireGap: 0.096, auto: true, reloadTime: 1.9,
    spreadStill: 0.0022, spreadMove: 0.028, pellets: 1, falloffNear: 14, falloffFar: 32, kick: 0.05,
  },
  marksman: {
    id: 'marksman', name: 'Longshore Marksman', price: 3200, damage: 62, headMult: 2.6,
    mag: 10, reserve: 30, fireGap: 0.45, auto: false, reloadTime: 2.2,
    spreadStill: 0.0008, spreadMove: 0.02, pellets: 1, falloffNear: 20, falloffFar: 45, kick: 0.08,
  },
};

export const WEAPON_ORDER = ['p9', 'scatter', 'carbine', 'marksman'];
