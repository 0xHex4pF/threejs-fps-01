// Last Light Quay: a dusk-lit container port, 44 by 34 metres, built from boxes,
// cylinders and one ring. Three lanes (west, mid, east) run between the two spawns;
// the uplink pad sits just north of mid, and stacked containers break every long
// sightline so no lane is a shooting gallery. Everything is plain geometry with
// shared materials: no models, no textures, no network.
import * as THREE from 'three';
import { PALETTE, CONFIG } from './config.js';

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'lamp' || name === 'padGlow' ? 0.4 : 0.9,
      metalness: name === 'darkSteel' || name === 'gunmetal' ? 0.5 : 0.05,
      emissive: name === 'lamp' ? new THREE.Color(PALETTE.lamp) : new THREE.Color(0x000000),
      emissiveIntensity: name === 'lamp' ? 1.6 : 0,
    });
  }

  const colliders = [];
  const shootables = [];
  const boxGeometryCache = new Map();

  function boxGeometry(w, h, d) {
    const key = `${w}|${h}|${d}`;
    let geometry = boxGeometryCache.get(key);
    if (!geometry) {
      geometry = new THREE.BoxGeometry(w, h, d);
      boxGeometryCache.set(key, geometry);
    }
    return geometry;
  }

  // A solid box: visible, collidable, and a surface bullets stop on.
  function box(w, h, d, x, y, z, material, collide = true) {
    const mesh = new THREE.Mesh(boxGeometry(w, h, d), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) {
      colliders.push(new THREE.Box3().setFromObject(mesh));
      shootables.push(mesh);
    }
    return mesh;
  }

  function cylinder(radius, height, x, y, z, material, segments = 12) {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, height, segments),
      materials[material],
    );
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  // --- Ground, markings and the water beyond the north fence -------------------
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), materials.ground);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);
  // Painted lane lines: flat, never colliders.
  box(0.3, 0.02, 30, -13, 0.02, 0, 'groundLine', false);
  box(0.3, 0.02, 30, 13, 0.02, 0, 'groundLine', false);
  box(40, 0.02, 0.3, 0, 0.02, -2, 'groundLine', false);
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(160, 60),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.water), roughness: 0.25, metalness: 0.6 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -0.6, -47);
  group.add(water);

  // --- Perimeter: fence walls and stacked corner containers --------------------
  box(0.6, 4.2, 34.6, -22.2, 2.1, 0, 'darkSteel');
  box(0.6, 4.2, 34.6, 22.2, 2.1, 0, 'darkSteel');
  box(45, 4.2, 0.6, 0, 2.1, -17.2, 'darkSteel');
  box(45, 4.2, 0.6, 0, 2.1, 17.2, 'darkSteel');
  box(6, 2.6, 2.4, -18, 1.3, -14, 'rust');
  box(6, 2.6, 2.4, -18, 3.9, -14, 'teal');
  box(6, 2.6, 2.4, 18, 1.3, 14, 'teal');
  box(6, 2.6, 2.4, 18, 3.9, 14, 'mustard');

  // --- Mid: the container that splits the centre lane, and pad cover ------------
  box(6, 2.6, 2.4, 0, 1.3, -7.5, 'rust');
  box(2.4, 2.6, 6, -8, 1.3, -2, 'teal');
  box(2.4, 2.6, 6, 8, 1.3, 2, 'mustard');
  box(1.2, 1.1, 1.2, -3.4, 0.55, 0.6, 'crate');
  box(1.2, 1.1, 1.2, 3.4, 0.55, -4.6, 'crate');
  box(1.2, 1.1, 1.2, -3.4, 0.55, -4.6, 'crate');
  box(1.2, 1.1, 1.2, 3.4, 0.55, 0.6, 'crate');

  // --- West and east lanes: long containers, crates, barrels --------------------
  box(2.4, 2.6, 6, -14, 1.3, -8, 'slate');
  box(2.4, 2.6, 6, -14, 1.3, 6, 'mustard');
  box(2.4, 2.6, 6, 14, 1.3, -8, 'teal');
  box(2.4, 2.6, 6, 14, 1.3, 6, 'rust');
  box(6, 2.6, 2.4, -17, 1.3, -2, 'teal');
  box(6, 2.6, 2.4, -17, 3.9, -2, 'slate');
  box(6, 2.6, 2.4, 17, 1.3, 2, 'rust');
  box(1.6, 1.1, 1.6, -9, 0.55, -9, 'crate');
  box(1.6, 1.1, 1.6, -9, 0.55, 8, 'crate');
  box(1.6, 1.1, 1.6, 9, 0.55, -9, 'crate');
  box(1.6, 1.1, 1.6, 9, 0.55, 8, 'crate');
  box(1.2, 1.1, 1.2, -5, 0.55, 10, 'crate');
  box(1.2, 1.1, 1.2, 5, 0.55, -10, 'crate');
  cylinder(0.45, 1.1, -6.5, 0.55, -5, 'barrel');
  cylinder(0.45, 1.1, -5.6, 0.55, -4.4, 'barrel');
  cylinder(0.45, 1.1, 6.5, 0.55, 5, 'barrel');
  cylinder(0.45, 1.1, 5.6, 0.55, 4.4, 'barrel');
  cylinder(0.45, 1.1, -18, 0.55, 8, 'barrel');
  cylinder(0.45, 1.1, 18, 0.55, -8, 'barrel');

  // --- Spawn cover ---------------------------------------------------------------
  box(2.4, 1.1, 1.2, -4, 0.55, 11.5, 'crate');
  box(2.4, 1.1, 1.2, 4, 0.55, 11.5, 'crate');
  box(2.4, 1.1, 1.2, -4, 0.55, -11.5, 'crate');
  box(2.4, 1.1, 1.2, 4, 0.55, -11.5, 'crate');

  // --- The dock crane: a silhouette at the north-east corner ---------------------
  box(0.8, 10, 0.8, 16, 5, -14.5, 'darkSteel');
  box(0.8, 10, 0.8, 20, 5, -14.5, 'darkSteel');
  box(11, 0.8, 0.8, 16.5, 10, -14.5, 'darkSteel');
  box(2.2, 1.4, 2.2, 13, 9, -14.5, 'mustard');
  box(0.15, 3.2, 0.15, 12, 7.4, -14.5, 'darkSteel', false);
  box(2.4, 1.8, 2.4, 12, 5, -14.5, 'rust', false);

  // --- Lamp posts -----------------------------------------------------------------
  function lamp(x, z) {
    box(0.18, 4.6, 0.18, x, 2.3, z, 'darkSteel', false);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), materials.lamp);
    head.position.set(x, 4.7, z);
    group.add(head);
  }
  lamp(-6, -12);
  lamp(6, 12);
  lamp(-13, 0);
  lamp(13, 0);

  // --- The uplink pad: ring, posts, hologram --------------------------------------
  const pad = { x: CONFIG.uplink.x, z: CONFIG.uplink.z, half: CONFIG.uplink.half };
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(PALETTE.padGlow), transparent: true, opacity: 0.85, side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.9, 2.3, 40), ringMaterial);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(pad.x, 0.05, pad.z);
  group.add(ring);
  for (const [px, pz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) {
    box(0.22, 1.1, 0.22, pad.x + px, 0.55, pad.z + pz, 'darkSteel', false);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), materials.lamp);
    tip.position.set(pad.x + px, 1.2, pad.z + pz);
    group.add(tip);
  }
  const hologramMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(PALETTE.padGlow), transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide,
  });
  const hologram = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.5, 3.6, 20, 1, true), hologramMaterial);
  hologram.position.set(pad.x, 1.8, pad.z);
  group.add(hologram);
  box(1.4, 0.9, 0.7, pad.x + 2.9, 0.45, pad.z + 1.6, 'darkSteel');

  // --- Light: low amber sun, cool sky fill, two warm lamps -------------------------
  const sky = new THREE.HemisphereLight(new THREE.Color(0x8fa3c8), new THREE.Color(PALETTE.ground), 0.85);
  scene.add(sky);
  const sun = new THREE.DirectionalLight(new THREE.Color(0xffb45e), 2.4);
  sun.position.set(-18, 16, -22);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -28;
  sun.shadow.camera.right = 28;
  sun.shadow.camera.top = 28;
  sun.shadow.camera.bottom = -28;
  sun.shadow.camera.far = 70;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(new THREE.Color(0x6f86b8), 0.5);
  fill.position.set(14, 10, 16);
  scene.add(fill);
  const padLight = new THREE.PointLight(new THREE.Color(PALETTE.padGlow), 14, 12);
  padLight.position.set(pad.x, 3.4, pad.z);
  scene.add(padLight);
  const westLight = new THREE.PointLight(new THREE.Color(PALETTE.lamp), 10, 11);
  westLight.position.set(-13, 4.7, 0);
  scene.add(westLight);

  // --- Waypoints: the graph bots route over ----------------------------------------
  // Nodes are [x, z]; links are bidirectional. Hold nodes are defensive posts.
  const waypointDefs = [
    { x: 0, z: 14, links: [1, 2, 3, 13, 14, 15] }, // 0 Warden spawn
    { x: -12, z: 10, links: [0, 4, 13] }, // 1 west approach
    { x: -3, z: 8, links: [0, 15, 5] }, // 2 mid approach
    { x: 12, z: 10, links: [0, 8, 14] }, // 3 east approach
    { x: -13, z: 0, links: [1, 5, 9, 16] }, // 4 west mid
    { x: -4, z: -2, links: [2, 4, 6, 15], hold: true }, // 5 pad west
    { x: 0, z: -2, links: [5, 7, 10, 15] }, // 6 the pad
    { x: 4, z: -2, links: [6, 8, 11], hold: true }, // 7 pad east
    { x: 13, z: 0, links: [3, 7, 11, 17] }, // 8 east mid
    { x: -12, z: -9, links: [4, 10, 12, 16] }, // 9 west north
    { x: -3, z: -9, links: [6, 9, 11, 12] }, // 10 mid north
    { x: 12, z: -9, links: [7, 8, 10, 12, 17] }, // 11 east north
    { x: 0, z: -14, links: [9, 10, 11] }, // 12 Jackal spawn
    { x: -8, z: 5, links: [0, 1, 4], hold: true }, // 13 west hold
    { x: 8, z: 5, links: [0, 3, 8], hold: true }, // 14 east hold
    { x: 0, z: 4, links: [0, 2, 5, 6] }, // 15 pad south
    { x: -17, z: -5, links: [4, 9] }, // 16 north-west corner
    { x: 17, z: -5, links: [8, 11] }, // 17 north-east corner
  ];
  const waypoints = waypointDefs.map((def, id) => ({ id, x: def.x, z: def.z, links: def.links, hold: !!def.hold }));

  const spawns = {
    warden: [
      { x: 0, z: 14, yaw: 0 },
      { x: -3, z: 14.5, yaw: 0 },
      { x: 3, z: 14.5, yaw: 0 },
    ],
    jackal: [
      { x: 0, z: -14, yaw: Math.PI },
      { x: -3, z: -14.5, yaw: Math.PI },
      { x: 3, z: -14.5, yaw: Math.PI },
    ],
  };

  return {
    colliders,
    shootables,
    group,
    waypoints,
    spawns,
    pad,
    animate(time) {
      hologram.rotation.y = time * 0.6;
      ringMaterial.opacity = 0.7 + Math.sin(time * 2.2) * 0.15;
    },
    setUplinkGlow(progress, contested) {
      const intensity = contested ? 26 : 14 + progress * 10;
      padLight.intensity = intensity;
      hologramMaterial.opacity = 0.08 + progress * 0.16 + (contested ? 0.08 : 0);
    },
  };
}
