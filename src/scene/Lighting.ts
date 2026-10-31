import * as THREE from 'three';

/** Iluminación de laboratorio: luz clave fría, relleno cálido suave y contraluz cian. */
export function createLighting(): THREE.Group {
  const g = new THREE.Group();
  g.add(new THREE.HemisphereLight(0x9cc4ff, 0x0a0f18, 0.55));

  const key = new THREE.DirectionalLight(0xe8f1ff, 2.2);
  key.position.set(4, 9, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -6;
  key.shadow.camera.right = 6;
  key.shadow.camera.top = 5;
  key.shadow.camera.bottom = -5;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  g.add(key);

  const fill = new THREE.DirectionalLight(0xffd8b0, 0.45);
  fill.position.set(-6, 4, 3);
  g.add(fill);

  const rim = new THREE.DirectionalLight(0x4fc3ff, 0.9);
  rim.position.set(-3, 3, -8);
  g.add(rim);
  return g;
}
