// The world's collision queries, shared by the player, the bots and the grenades.
// One Box3 probe and one Raycaster are reused, so the hot paths allocate nothing.
import * as THREE from 'three';

export function createCollision(colliders) {
  const probe = new THREE.Box3();
  const raycaster = new THREE.Raycaster();
  const origin = new THREE.Vector3();
  const direction = new THREE.Vector3();

  // The first collider overlapping a standing box, or null. lift keeps the feet and
  // the crown out of the horizontal tests, so standing on the floor is not read as
  // walking into a wall.
  function overlaps(x, y, z, radius, height, lift) {
    probe.min.set(x - radius, y + lift, z - radius);
    probe.max.set(x + radius, y + height - lift, z + radius);
    for (let i = 0; i < colliders.length; i += 1) {
      if (probe.intersectsBox(colliders[i])) return colliders[i];
    }
    return null;
  }

  // Move a standing body by (dx, dz) one axis at a time, sliding along walls.
  // Returns true when either axis was blocked. y stays untouched: callers own gravity.
  function slideMove(position, dx, dz, radius, height) {
    let blocked = false;
    if (dx !== 0) {
      const nextX = position.x + dx;
      if (!overlaps(nextX, position.y, position.z, radius, height, 0.04)) position.x = nextX;
      else blocked = true;
    }
    if (dz !== 0) {
      const nextZ = position.z + dz;
      if (!overlaps(position.x, position.y, nextZ, radius, height, 0.04)) position.z = nextZ;
      else blocked = true;
    }
    return blocked;
  }

  // The first ray hit against a target list, or null. far caps the range.
  function rayHit(from, dir, far, targets) {
    origin.copy(from);
    direction.copy(dir);
    raycaster.set(origin, direction);
    raycaster.far = far;
    const hits = raycaster.intersectObjects(targets, false);
    return hits.length ? hits[0] : null;
  }

  // True when any target stands between two points (line-of-sight test).
  function segmentBlocked(a, b, targets) {
    direction.subVectors(b, a);
    const distance = direction.length();
    if (distance < 0.001) return false;
    direction.divideScalar(distance);
    const hit = rayHit(a, direction, distance, targets);
    return hit !== null;
  }

  return { overlaps, slideMove, rayHit, segmentBlocked };
}
