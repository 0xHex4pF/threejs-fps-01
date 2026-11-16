// Grenades: a thrown sphere with gravity, bounces off the world's boxes, and a
// fuse. The explosion itself — damage, light, shake — is resolved by main.js
// through onExplode; this module owns the flight and the visual flash.
import * as THREE from 'three';
import { CONFIG, PALETTE } from './config.js';

const grenadeGeometry = new THREE.SphereGeometry(0.09, 10, 8);
const grenadeMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.darkSteel), roughness: 0.6, metalness: 0.4 });
const flashGeometry = new THREE.SphereGeometry(1, 16, 12);

export function createGrenades(scene, collision, onExplode) {
  const live = [];
  const flashes = [];

  function throwGrenade(origin, direction) {
    const mesh = new THREE.Mesh(grenadeGeometry, grenadeMaterial);
    mesh.position.copy(origin);
    scene.add(mesh);
    live.push({
      mesh,
      velocity: direction.clone().multiplyScalar(CONFIG.grenadeThrowSpeed),
      fuse: CONFIG.grenadeFuse,
      spin: 0,
    });
  }

  function bounceStep(grenade, dt) {
    const pos = grenade.mesh.position;
    const vel = grenade.velocity;
    vel.y -= CONFIG.gravity * dt;
    const radius = 0.09;
    const height = 0.18;
    const nextX = pos.x + vel.x * dt;
    if (!collision.overlaps(nextX, pos.y, pos.z, radius, height, 0)) pos.x = nextX;
    else vel.x = -vel.x * CONFIG.grenadeBounce;
    const nextZ = pos.z + vel.z * dt;
    if (!collision.overlaps(pos.x, pos.y, nextZ, radius, height, 0)) pos.z = nextZ;
    else vel.z = -vel.z * CONFIG.grenadeBounce;
    const nextY = pos.y + vel.y * dt;
    if (nextY <= radius) {
      pos.y = radius;
      if (Math.abs(vel.y) > 1.2) vel.y = -vel.y * CONFIG.grenadeBounce;
      else {
        vel.y = 0;
        vel.x *= 0.86;
        vel.z *= 0.86;
      }
    } else if (!collision.overlaps(pos.x, nextY, pos.z, radius, height, 0)) {
      pos.y = nextY;
    } else {
      vel.y = -vel.y * CONFIG.grenadeBounce;
    }
  }

  function explode(grenade) {
    const position = grenade.mesh.position.clone();
    scene.remove(grenade.mesh);
    const flashMesh = new THREE.Mesh(
      flashGeometry,
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.lamp), transparent: true, opacity: 0.85, depthWrite: false }),
    );
    flashMesh.position.copy(position);
    flashMesh.scale.setScalar(0.3);
    scene.add(flashMesh);
    const light = new THREE.PointLight(new THREE.Color(PALETTE.lamp), 60, 18);
    light.position.copy(position);
    scene.add(light);
    flashes.push({ mesh: flashMesh, light, age: 0 });
    onExplode(position);
  }

  function step(dt) {
    for (let i = live.length - 1; i >= 0; i -= 1) {
      const grenade = live[i];
      grenade.fuse -= dt;
      grenade.spin += dt * 9;
      grenade.mesh.rotation.x = grenade.spin;
      bounceStep(grenade, dt);
      if (grenade.fuse <= 0) {
        live.splice(i, 1);
        explode(grenade);
      }
    }
    for (let i = flashes.length - 1; i >= 0; i -= 1) {
      const flash = flashes[i];
      flash.age += dt;
      const t = flash.age / 0.4;
      if (t >= 1) {
        scene.remove(flash.mesh, flash.light);
        flash.mesh.material.dispose();
        flashes.splice(i, 1);
      } else {
        flash.mesh.scale.setScalar(0.3 + t * CONFIG.grenadeRadius);
        flash.mesh.material.opacity = 0.85 * (1 - t);
        flash.light.intensity = 60 * (1 - t);
      }
    }
  }

  function clear() {
    for (const grenade of live) scene.remove(grenade.mesh);
    live.length = 0;
    for (const flash of flashes) {
      scene.remove(flash.mesh, flash.light);
      flash.mesh.material.dispose();
    }
    flashes.length = 0;
  }

  return { throwGrenade, step, clear };
}
