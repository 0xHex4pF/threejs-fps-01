// The player's arsenal: four view models built from boxes, the magazine and
// reserve each one carries, and the fire/reload rhythm. It owns no raycasts —
// main.js fires the ray and reports the result — but it owns the feel: spread that
// grows with movement, recoil kick, reload dip, walk bob and the muzzle flash.
import * as THREE from 'three';
import { WEAPONS, WEAPON_ORDER, PALETTE } from './config.js';

const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.gunmetal), roughness: 0.5, metalness: 0.4 });
const gripMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.darkSteel), roughness: 0.8, metalness: 0.15 });
const woodMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.crate), roughness: 0.75, metalness: 0.05 });
const brassMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.mustard), roughness: 0.45, metalness: 0.5 });

function part(w, h, d, x, y, z, mat) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  return mesh;
}

// Each model is a group whose origin sits at the grip; the barrel points down -z.
function buildModel(id) {
  const model = new THREE.Group();
  if (id === 'p9') {
    model.add(part(0.05, 0.06, 0.22, 0, 0.02, -0.08, bodyMat));
    model.add(part(0.045, 0.12, 0.06, 0, -0.05, 0.04, gripMat));
    model.add(part(0.02, 0.02, 0.05, 0, 0.06, -0.18, bodyMat));
  } else if (id === 'scatter') {
    model.add(part(0.09, 0.07, 0.34, 0, 0.01, -0.12, woodMat));
    model.add(part(0.07, 0.06, 0.42, 0, 0.05, -0.2, bodyMat));
    model.add(part(0.07, 0.05, 0.1, 0, 0.05, -0.44, brassMat));
    model.add(part(0.07, 0.1, 0.16, 0, -0.03, 0.12, woodMat));
  } else if (id === 'carbine') {
    model.add(part(0.07, 0.09, 0.4, 0, 0.01, -0.1, bodyMat));
    model.add(part(0.04, 0.04, 0.3, 0, 0.03, -0.42, bodyMat));
    model.add(part(0.05, 0.14, 0.07, 0, -0.09, -0.05, gripMat));
    model.add(part(0.05, 0.1, 0.06, 0, -0.06, -0.26, gripMat));
    model.add(part(0.06, 0.07, 0.18, 0, 0, 0.18, gripMat));
    model.add(part(0.02, 0.04, 0.08, 0, 0.08, -0.12, bodyMat));
  } else {
    model.add(part(0.06, 0.08, 0.46, 0, 0.01, -0.14, bodyMat));
    model.add(part(0.035, 0.035, 0.42, 0, 0.02, -0.52, bodyMat));
    model.add(part(0.05, 0.05, 0.14, 0, 0.08, -0.08, bodyMat));
    model.add(part(0.045, 0.12, 0.06, 0, -0.08, -0.02, gripMat));
    model.add(part(0.055, 0.08, 0.2, 0, -0.01, 0.16, woodMat));
  }
  return model;
}

export function createWeapons(camera, audio) {
  const holder = new THREE.Group();
  holder.position.set(0.24, -0.21, -0.42);
  camera.add(holder);
  const models = {};
  for (const id of WEAPON_ORDER) {
    models[id] = buildModel(id);
    models[id].visible = false;
    holder.add(models[id]);
  }

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.3, 0.3),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.lamp), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.19, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.lamp), 0, 6);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  const ammo = {};
  for (const id of WEAPON_ORDER) {
    ammo[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve };
  }
  const state = {
    current: 'p9',
    owned: new Set(['p9']),
    cooldown: 0,
    reloadLeft: 0,
    flash: 0,
    kick: 0,
    bobPhase: 0,
    triggerHeld: false,
  };
  models.p9.visible = true;

  const muzzleLocal = new THREE.Vector3(0.24, -0.19, -0.95);

  function step(dt, moveSpeed, time) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 12);
    state.bobPhase += dt * moveSpeed * 1.7;
    const bob = moveSpeed > 0.5 ? Math.sin(state.bobPhase) * 0.008 : 0;
    holder.position.y = -0.21 + bob + state.kick * 0.25;
    holder.position.z = -0.42 + state.kick;
    holder.rotation.x = state.kick * 1.8;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      const def = WEAPONS[state.current];
      const progress = 1 - state.reloadLeft / def.reloadTime;
      holder.rotation.x = -0.6 * Math.sin(progress * Math.PI);
      holder.position.y -= 0.06 * Math.sin(progress * Math.PI);
      if (state.reloadLeft === 0) {
        const slot = ammo[state.current];
        const take = Math.min(def.mag - slot.mag, slot.reserve);
        slot.mag += take;
        slot.reserve -= take;
      }
    }
    flash.visible = state.flash > 0;
    if (state.flash > 0) flash.rotation.z = time * 40;
    flashLight.intensity = state.flash > 0 ? 16 : 0;
  }

  function equip(id) {
    if (!state.owned.has(id) || id === state.current) return false;
    models[state.current].visible = false;
    state.current = id;
    models[id].visible = true;
    state.reloadLeft = 0;
    state.cooldown = Math.max(state.cooldown, 0.25);
    return true;
  }

  return {
    state,
    ammo,
    step,
    equip,
    def() {
      return WEAPONS[state.current];
    },
    ready() {
      return state.cooldown === 0 && state.reloadLeft === 0;
    },
    // Fires one trigger pull. Returns 'fired', 'empty', 'cooldown' or 'reloading'.
    // Semi-automatic weapons need a fresh press: the caller passes triggerEdge.
    pullTrigger(triggerEdge) {
      const def = WEAPONS[state.current];
      if (state.reloadLeft > 0) return 'reloading';
      if (state.cooldown > 0) return 'cooldown';
      if (!def.auto && !triggerEdge) return 'cooldown';
      const slot = ammo[state.current];
      if (slot.mag <= 0) {
        state.cooldown = 0.25;
        audio.dryFire();
        return 'empty';
      }
      slot.mag -= 1;
      state.cooldown = def.fireGap;
      state.flash = 0.05;
      state.kick = def.kick;
      audio.shoot(def.id === 'scatter' || def.id === 'marksman');
      return 'fired';
    },
    reload() {
      const def = WEAPONS[state.current];
      const slot = ammo[state.current];
      if (state.reloadLeft > 0 || slot.mag === def.mag || slot.reserve === 0) return false;
      state.reloadLeft = def.reloadTime;
      audio.reload();
      return true;
    },
    spread(moveSpeed) {
      const def = WEAPONS[state.current];
      return def.spreadStill + Math.min(1, moveSpeed / 5.2) * def.spreadMove;
    },
    refillAmmo() {
      for (const id of state.owned) {
        ammo[id].mag = WEAPONS[id].mag;
        ammo[id].reserve = WEAPONS[id].reserve;
      }
      state.reloadLeft = 0;
    },
    buyWeapon(id) {
      state.owned.add(id);
      ammo[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve };
      equip(id);
    },
    resetMatch() {
      state.owned = new Set(['p9']);
      for (const id of WEAPON_ORDER) {
        ammo[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve };
      }
      models[state.current].visible = false;
      state.current = 'p9';
      models.p9.visible = true;
      state.reloadLeft = 0;
      state.cooldown = 0;
    },
    muzzleWorld(out) {
      return out.copy(muzzleLocal).applyMatrix4(camera.matrixWorld);
    },
    showFlash() {
      state.flash = 0.05;
    },
  };
}
