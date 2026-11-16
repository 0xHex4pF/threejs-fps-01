// Transient combat visuals: bullet tracers and impact sparks. Small fixed pools,
// reused, so firing never allocates. Tracers are stretched boxes aligned between
// two points; sparks are short-lived quads that shrink away.
import * as THREE from 'three';
import { PALETTE } from './config.js';

const tracerGeometry = new THREE.BoxGeometry(0.02, 0.02, 1);
const sparkGeometry = new THREE.PlaneGeometry(0.16, 0.16);
const up = new THREE.Vector3(0, 0, 1);
const span = new THREE.Vector3();

export function createEffects(scene) {
  const tracers = [];
  const sparks = [];
  const tracerMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(PALETTE.lamp), transparent: true, opacity: 0.75, depthWrite: false,
  });
  const sparkMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0xffe6b0), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide,
  });
  for (let i = 0; i < 14; i += 1) {
    const mesh = new THREE.Mesh(tracerGeometry, tracerMat);
    mesh.visible = false;
    scene.add(mesh);
    tracers.push({ mesh, life: 0 });
  }
  for (let i = 0; i < 10; i += 1) {
    const mesh = new THREE.Mesh(sparkGeometry, sparkMat);
    mesh.visible = false;
    scene.add(mesh);
    sparks.push({ mesh, life: 0 });
  }
  let tracerCursor = 0;
  let sparkCursor = 0;

  function spawnTracer(from, to) {
    const tracer = tracers[tracerCursor];
    tracerCursor = (tracerCursor + 1) % tracers.length;
    span.subVectors(to, from);
    const length = span.length();
    if (length < 0.1) return;
    tracer.mesh.position.copy(from).addScaledVector(span, 0.5);
    tracer.mesh.scale.set(1, 1, length);
    tracer.mesh.quaternion.setFromUnitVectors(up, span.normalize());
    tracer.mesh.visible = true;
    tracer.life = 0.06;
  }

  function spawnSpark(point) {
    const spark = sparks[sparkCursor];
    sparkCursor = (sparkCursor + 1) % sparks.length;
    spark.mesh.position.copy(point);
    spark.mesh.rotation.set(Math.random() * 3, Math.random() * 3, 0);
    spark.mesh.scale.setScalar(1);
    spark.mesh.visible = true;
    spark.life = 0.12;
  }

  function step(dt) {
    for (const tracer of tracers) {
      if (tracer.life <= 0) continue;
      tracer.life -= dt;
      if (tracer.life <= 0) tracer.mesh.visible = false;
    }
    for (const spark of sparks) {
      if (spark.life <= 0) continue;
      spark.life -= dt;
      spark.mesh.scale.setScalar(Math.max(0.05, spark.life / 0.12));
      if (spark.life <= 0) spark.mesh.visible = false;
    }
  }

  return { spawnTracer, spawnSpark, step };
}
