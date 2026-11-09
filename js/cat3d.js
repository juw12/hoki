// Hoki in 3D: a soft-glazed kawaii maneki-neko built from simple solids with three.js (vendored, MIT).
//
// Hoki faces you. The raised paw beckons the way a real lucky cat does: the forearm leans in from the
// shoulder and the hand folds toward you at the wrist (rotations about X, so the motion is front-to-back).
// It is alive: big glossy eyes follow your pointer, it blinks, squeezes its eyes shut happily when you tap
// it, leans into your hand when you stroke its head, twitches its ears and sways its tail.
// Everything is procedural and parametric: change a number in SIZE, EYE or COLORS and the cat rebuilds.

import * as THREE from './vendor/three.module.min.js';

// ---------- design parameters (scene units; head radius ~1.2) ----------
const SIZE = {
  bodyRadius: 1.0,
  bodyScale: [1.0, 1.06, 0.9],
  bodyY: 1.0,
  headRadius: 1.05,
  headScale: [1.24, 1.0, 0.98],
  headY: 2.48,
  earHeight: 0.66,
  earRadius: 0.36,
  shoulder: [-0.94, 1.6, 0.34],    // the raised (right) arm hinges here, clear of the cheek
  armLength: 0.92,
  armRadius: 0.25,
  pawRadius: 0.36,
  coinCenter: [0.42, 0.92, 0.86],
  groundY: -0.06,                  // the cat sits straight on the ground (no cushion)
};

// Big, low-set, wide kawaii eyes (head-local units) with two catch-light sparkles.
const EYE = { x: 0.45, y: 0.04, rx: 0.2, ry: 0.245, depth: 0.1 };

const COLORS = {
  glaze: new THREE.Color('#fffbf4'),
  calico: new THREE.Color('#e5a15a'),
  spot: new THREE.Color('#6d5a52'),
  blush: new THREE.Color('#f2b3aa'),
  earInside: new THREE.Color('#f1b9b0'),
  pad: new THREE.Color('#ee9f97'),
  ink: new THREE.Color('#4e3528'),
  collar: new THREE.Color('#c23b2e'),
  gold: new THREE.Color('#d9a441'),
  eye: new THREE.Color('#2a1a14'),
  iris: new THREE.Color('#8a5634'),
};

// Beckon: how far the hand folds (radians at full fold) and how far the forearm leans in.
const BECKON = { wrist: 1.05, arm: 0.28 };

// ---------- helpers ----------
function ceramic(options = {}) {
  return new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.52,
    clearcoat: 0.3,
    clearcoatRoughness: 0.45,
    sheen: 0.35,
    sheenRoughness: 0.8,
    sheenColor: new THREE.Color('#fff0dc'),
    ...options,
  });
}

function smooth(edge0, edge1, value) {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// Paint glaze patches onto a mesh's vertices: each patch is {center, radius, color, strength}.
// Positions are taken in the mesh's local space after its scale, so patches follow the surface.
function paintPatches(geometry, scale, patches, base = COLORS.glaze) {
  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 3);
  const point = new THREE.Vector3();
  const color = new THREE.Color();
  for (let i = 0; i < position.count; i += 1) {
    point.fromBufferAttribute(position, i).multiply(scale);
    color.copy(base);
    for (const patch of patches) {
      const distance = point.distanceTo(patch.center);
      const amount = (1 - smooth(patch.radius * 0.78, patch.radius, distance)) * (patch.strength ?? 1);
      if (amount > 0) {
        color.lerp(patch.color, amount);
      }
    }
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

function ellipsoid(radius, scale, material, segments = 96) {
  const geometry = new THREE.SphereGeometry(radius, segments, Math.round(segments * 0.75));
  const mesh = new THREE.Mesh(geometry, material);
  mesh.scale.set(...scale);
  return mesh;
}

// A point on the head's front surface (head-local coordinates) and its outward normal.
function headSurface(x, y, lift = 0) {
  const [sx, sy, sz] = SIZE.headScale;
  const r = SIZE.headRadius;
  const u = x / (r * sx);
  const v = y / (r * sy);
  const w = Math.sqrt(Math.max(0, 1 - u * u - v * v));
  const point = new THREE.Vector3(x, y, w * r * sz);
  const normal = new THREE.Vector3(u / sx, v / sy, w / sz).normalize();
  return point.add(normal.clone().multiplyScalar(lift));
}

function headNormal(x, y) {
  const [sx, sy, sz] = SIZE.headScale;
  const r = SIZE.headRadius;
  const u = x / (r * sx);
  const v = y / (r * sy);
  const w = Math.sqrt(Math.max(0, 1 - u * u - v * v));
  return new THREE.Vector3(u / sx, v / sy, w / sz).normalize();
}

// Sit an object on the face so its local +Z points out of the head.
function placeOnHead(object, x, y, lift = 0) {
  object.position.copy(headSurface(x, y, lift));
  object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), headNormal(x, y));
  return object;
}

// A smooth stroke drawn on the face (eyes, mouth, whiskers) as a thin tube.
function faceStroke(points2d, radius, material, lift = 0.012) {
  const curve = new THREE.CatmullRomCurve3(points2d.map(([x, y]) => headSurface(x, y, lift)));
  return new THREE.Mesh(new THREE.TubeGeometry(curve, 32, radius, 10, false), material);
}

function arcPoints(cx, cy, rx, ry, start, end, steps = 12) {
  const points = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = start + ((end - start) * i) / steps;
    points.push([cx + rx * Math.cos(t), cy + ry * Math.sin(t)]);
  }
  return points;
}

// A soft ear: a lathe profile that swells from the base and closes in a rounded tip.
function earGeometry(radius, height) {
  const points = [];
  const steps = 18;
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const r = radius * Math.sin(Math.acos(t * 0.98)) * (1 - 0.35 * t * t) * Math.pow(1 - t, 0.55);
    points.push(new THREE.Vector2(Math.max(r, 0.0001), t * height));
  }
  return new THREE.LatheGeometry(points, 48);
}

function coinTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  const gradient = g.createRadialGradient(size * 0.4, size * 0.35, size * 0.05, size / 2, size / 2, size * 0.5);
  gradient.addColorStop(0, '#f6d27a');
  gradient.addColorStop(0.7, '#dcaa45');
  gradient.addColorStop(1, '#b9832c');
  g.fillStyle = gradient;
  g.fillRect(0, 0, size, size);
  g.strokeStyle = 'rgba(122, 82, 26, 0.75)';
  g.lineWidth = 10;
  g.beginPath();
  g.ellipse(size / 2, size / 2, size * 0.42, size * 0.42, 0, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = '#7a4f1d';
  g.font = `700 ${size * 0.5}px "Songti SC", "SimSun", "Noto Serif SC", serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('福', size / 2, size * 0.53);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// ---------- the cat ----------
function buildCat() {
  const cat = new THREE.Group();
  const glaze = ceramic({ vertexColors: true });
  const ink = new THREE.MeshStandardMaterial({ color: COLORS.ink, roughness: 0.5 });
  const gold = new THREE.MeshPhysicalMaterial({ color: COLORS.gold, metalness: 0.6, roughness: 0.26, clearcoat: 0.6 });

  // Body with a calico patch and a dark spot on the belly side.
  const bodyScale = new THREE.Vector3(...SIZE.bodyScale);
  const body = ellipsoid(SIZE.bodyRadius, SIZE.bodyScale, glaze, 144);
  paintPatches(body.geometry, bodyScale, [
    { center: new THREE.Vector3(-0.62, -0.35, 0.55), radius: 0.42, color: COLORS.calico },
    { center: new THREE.Vector3(-0.68, -0.42, 0.6), radius: 0.17, color: COLORS.spot },
    { center: new THREE.Vector3(0.95, 0.2, -0.45), radius: 0.45, color: COLORS.calico },
  ]);
  body.position.y = SIZE.bodyY;
  cat.add(body);

  // Head: big and round, with calico over the right ear, a dark spot and blushing cheeks.
  const head = new THREE.Group();
  head.position.y = SIZE.headY;
  const headScale = new THREE.Vector3(...SIZE.headScale);
  const skull = ellipsoid(SIZE.headRadius, SIZE.headScale, glaze, 192);
  paintPatches(skull.geometry, headScale, [
    { center: new THREE.Vector3(0.95, 0.72, 0.1), radius: 0.62, color: COLORS.calico },
    { center: new THREE.Vector3(-0.46, 0.74, 0.6), radius: 0.2, color: COLORS.spot },
    { center: headSurface(-0.76, -0.27), radius: 0.24, color: COLORS.blush, strength: 0.85 },
    { center: headSurface(0.76, -0.27), radius: 0.24, color: COLORS.blush, strength: 0.85 },
  ]);
  head.add(skull);

  // Ears: rounded cones with a pink inside, the right one calico. Kept so they can twitch.
  const ears = [];
  for (const side of [-1, 1]) {
    const ear = new THREE.Group();
    ear.position.set(side * 0.74, 0.74, -0.02);
    ear.rotation.z = -side * 0.42;
    ear.rotation.x = -0.08;
    const earGeo = earGeometry(SIZE.earRadius, SIZE.earHeight);
    const earMaterial = side > 0 ? ceramic({ color: COLORS.calico }) : ceramic({ vertexColors: true });
    if (side < 0) {
      // A soft warm shade on the cream ear so it carries as much weight as the calico one.
      paintPatches(earGeo, new THREE.Vector3(1, 1, 0.62), [
        { center: new THREE.Vector3(0, 0.26, 0.1), radius: 0.24, color: new THREE.Color('#f1dcc3'), strength: 0.5 },
      ]);
    }
    const outer = new THREE.Mesh(earGeo, earMaterial);
    outer.scale.z = 0.62;
    const inner = new THREE.Mesh(
      earGeometry(SIZE.earRadius * 0.66, SIZE.earHeight * 0.78),
      ceramic({ color: COLORS.earInside, clearcoat: 0.35 }),
    );
    inner.position.set(0, SIZE.earHeight * 0.05, SIZE.earRadius * 0.3);
    inner.scale.z = 0.36;
    ear.add(outer, inner);
    ear.userData = { side, baseX: ear.rotation.x, baseZ: ear.rotation.z };
    ears.push(ear);
    head.add(ear);
  }

  // Face: big glossy eyes with sparkles (plus happy '^ ^' eyes for taps and pets), whisker pads,
  // a small nose, an omega mouth and whiskers.
  const eyeMaterial = new THREE.MeshPhysicalMaterial({
    color: COLORS.eye,
    roughness: 0.12,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
  });
  const irisMaterial = new THREE.MeshPhysicalMaterial({ color: COLORS.iris, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.05 });
  const sparkle = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const eyes = [];
  const happyEyes = [];
  for (const side of [-1, 1]) {
    const socket = placeOnHead(new THREE.Group(), side * EYE.x, EYE.y, -0.012);
    const look = new THREE.Group();   // shifts with the gaze and squashes for blinks
    socket.add(look);
    const eyeball = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), eyeMaterial);
    eyeball.scale.set(EYE.rx, EYE.ry, EYE.depth);
    const iris = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), irisMaterial);
    iris.scale.set(EYE.rx * 0.66, EYE.ry * 0.42, EYE.depth * 0.42);
    iris.position.set(0, -EYE.ry * 0.42, EYE.depth * 0.6);
    const bigSparkle = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), sparkle);
    bigSparkle.scale.set(EYE.rx * 0.32, EYE.ry * 0.3, 0.01);
    bigSparkle.position.set(-side * EYE.rx * 0.28 - EYE.rx * 0.05, EYE.ry * 0.36, EYE.depth * 0.95);
    const smallSparkle = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), sparkle);
    smallSparkle.scale.set(EYE.rx * 0.14, EYE.ry * 0.12, 0.01);
    smallSparkle.position.set(side * EYE.rx * 0.34, -EYE.ry * 0.18, EYE.depth * 0.95);
    look.add(eyeball, iris, bigSparkle, smallSparkle);
    head.add(socket);
    eyes.push(look);
    const happy = faceStroke(arcPoints(side * EYE.x, EYE.y - 0.06, 0.17, 0.12, 0, Math.PI), 0.034, ink);
    happy.visible = false;
    head.add(happy);
    happyEyes.push(happy);

    // Whiskers fanning out from the cheeks.
    for (const [dy, tilt] of [[-0.12, 0.06], [-0.22, -0.02]]) {
      const start = [side * 0.92, -0.16 + dy];
      const end = [side * 1.42, -0.16 + dy + tilt];
      const points = [start, [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2 + 0.015], end];
      const curve = new THREE.CatmullRomCurve3(
        points.map(([x, y], index) => {
          const base = headSurface(Math.min(Math.abs(x), 1.2) * Math.sign(x), y, 0.02);
          base.z += index * 0.06;
          if (Math.abs(x) > 1.2) {
            base.x = x;
          }
          return base;
        }),
      );
      head.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.016, 6, false), ink));
    }
  }
  // Whisker pads: two soft bumps under the nose, the way a real cat's muzzle sits.
  const padGlaze = ceramic({ color: COLORS.glaze });
  for (const side of [-1, 1]) {
    const muzzle = placeOnHead(ellipsoid(0.13, [1.15, 0.85, 0.5], padGlaze, 32), side * 0.11, -0.27, -0.035);
    head.add(muzzle);
  }
  const nose = placeOnHead(ellipsoid(0.08, [1.25, 0.8, 0.7], ceramic({ color: '#ec8a83', clearcoat: 0.8 }), 32), 0, -0.17, 0.03);
  head.add(nose);
  for (const side of [-1, 1]) {
    head.add(faceStroke(arcPoints(side * 0.085, -0.25, 0.085, 0.07, Math.PI, Math.PI * 2), 0.02, ink, 0.05));
  }
  cat.add(head);

  // Collar with a gold bell.
  const collar = new THREE.Mesh(
    new THREE.TorusGeometry(0.84, 0.13, 28, 112),
    new THREE.MeshPhysicalMaterial({ color: COLORS.collar, roughness: 0.45, clearcoat: 0.6 }),
  );
  collar.rotation.x = Math.PI / 2 - 0.12;
  collar.scale.set(1.12, 0.98, 1);
  collar.position.set(0, 1.64, 0.06);
  cat.add(collar);
  const bell = new THREE.Mesh(new THREE.SphereGeometry(0.19, 48, 36), gold);
  bell.position.set(0, 1.5, 0.98);
  const bellBand = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.025, 12, 48), gold);
  bellBand.position.copy(bell.position);
  bellBand.rotation.x = Math.PI / 2;
  const bellSlot = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.12, 0.05), ink);
  bellSlot.position.set(0, 1.42, 1.15);
  cat.add(bell, bellBand, bellSlot);

  // The koban coin held against the chest, with the left paw gripping its edge.
  const coin = new THREE.Group();
  coin.position.set(...SIZE.coinCenter);
  coin.rotation.set(-0.12, 0.18, -0.12);
  const coinRim = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.12, 72), gold);
  coinRim.rotation.x = Math.PI / 2;
  coinRim.scale.set(0.36, 1, 0.52);
  const coinFace = new THREE.Mesh(
    new THREE.CircleGeometry(1, 72),
    new THREE.MeshPhysicalMaterial({ map: coinTexture(), metalness: 0.3, roughness: 0.3, clearcoat: 0.7 }),
  );
  coinFace.scale.set(0.35, 0.51, 1);
  coinFace.position.z = 0.062;
  coin.add(coinRim, coinFace);
  cat.add(coin);
  const coinPaw = ellipsoid(0.24, [1, 0.82, 0.9], glaze, 48);
  paintPatches(coinPaw.geometry, new THREE.Vector3(1, 0.82, 0.9), []);
  coinPaw.position.set(0.7, 1.22, 0.84);
  cat.add(coinPaw);

  // Feet peeking out at the front.
  for (const side of [-1, 1]) {
    const foot = ellipsoid(0.3, [1, 0.55, 1.15], glaze, 48);
    paintPatches(foot.geometry, new THREE.Vector3(1, 0.55, 1.15), []);
    foot.position.set(side * 0.44, 0.1, 0.72);
    cat.add(foot);
    for (const toe of [-1, 1]) {
      const line = new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.07, 4, 6), ink);
      line.position.set(side * 0.44 + toe * 0.07, 0.12, 1.06);
      line.rotation.x = 0.5;
      cat.add(line);
    }
  }

  // Tail curling up behind the right hip, with a calico tip; it pivots at its root so it can sway.
  const tail = new THREE.Group();
  const tailRoot = new THREE.Vector3(0.55, 0.25, -0.65);
  tail.position.copy(tailRoot);
  const tailCurve = new THREE.CatmullRomCurve3(
    [
      new THREE.Vector3(0.55, 0.25, -0.65),
      new THREE.Vector3(1.05, 0.28, -0.42),
      new THREE.Vector3(1.32, 0.6, -0.05),
      new THREE.Vector3(1.28, 1.02, 0.12),
    ].map((point) => point.sub(tailRoot)),
  );
  const tailGeometry = new THREE.TubeGeometry(tailCurve, 48, 0.14, 20, false);
  const tailColors = new Float32Array(tailGeometry.attributes.position.count * 3);
  const uv = tailGeometry.attributes.uv;
  const tailColor = new THREE.Color();
  for (let i = 0; i < uv.count; i += 1) {
    tailColor.copy(COLORS.glaze).lerp(COLORS.calico, smooth(0.62, 0.72, uv.getX(i)));
    tailColor.toArray(tailColors, i * 3);
  }
  tailGeometry.setAttribute('color', new THREE.BufferAttribute(tailColors, 3));
  tail.add(new THREE.Mesh(tailGeometry, glaze));
  const tailTip = new THREE.Mesh(new THREE.SphereGeometry(0.14, 24, 18), ceramic({ color: COLORS.calico }));
  tailTip.position.copy(tailCurve.getPoint(1));
  tail.add(tailTip);
  cat.add(tail);

  // The raised, beckoning arm: shoulder -> forearm -> wrist -> paw with pink pads.
  const shoulder = new THREE.Group();
  shoulder.position.set(...SIZE.shoulder);
  shoulder.rotation.z = 0.4;
  cat.add(shoulder);
  const armColor = ceramic({ color: COLORS.glaze });
  const forearm = new THREE.Mesh(new THREE.CapsuleGeometry(SIZE.armRadius, SIZE.armLength - SIZE.armRadius, 12, 32), armColor);
  forearm.position.y = SIZE.armLength / 2;
  forearm.scale.set(1.05, 1, 0.95);
  const shoulderBall = new THREE.Mesh(new THREE.SphereGeometry(SIZE.armRadius * 1.18, 32, 24), armColor);
  shoulder.add(forearm, shoulderBall);
  const wrist = new THREE.Group();
  wrist.position.y = SIZE.armLength;
  shoulder.add(wrist);
  const paw = ellipsoid(SIZE.pawRadius, [1, 0.96, 0.72], armColor, 64);
  paw.position.y = SIZE.pawRadius * 0.82;
  wrist.add(paw);
  const padMaterial = ceramic({ color: COLORS.pad, clearcoat: 0.4 });
  const palmPad = ellipsoid(0.13, [1.15, 0.95, 0.45], padMaterial, 32);
  palmPad.position.set(0, SIZE.pawRadius * 0.62, SIZE.pawRadius * 0.66);
  wrist.add(palmPad);
  for (const [x, y] of [[-0.19, 1.12], [-0.07, 1.3], [0.07, 1.3], [0.19, 1.12]]) {
    const toe = ellipsoid(0.058, [1, 1.1, 0.5], padMaterial, 24);
    toe.position.set(x, SIZE.pawRadius * y, SIZE.pawRadius * 0.58);
    wrist.add(toe);
  }
  const pawTip = new THREE.Object3D();
  pawTip.position.y = SIZE.pawRadius * 1.6;
  wrist.add(pawTip);

  cat.traverse((node) => {
    if (node.isMesh) {
      node.castShadow = true;
      node.receiveShadow = true;
    }
  });
  return { cat, shoulder, wrist, pawTip, head, eyes, happyEyes, ears, tail };
}

// No cushion: Hoki sits on an invisible floor that only catches its shadow, plus a soft contact blob.
function buildGround() {
  const group = new THREE.Group();
  const catcher = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.ShadowMaterial({ opacity: 0.11 }));
  catcher.rotation.x = -Math.PI / 2;
  catcher.position.y = SIZE.groundY;
  catcher.receiveShadow = true;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  const gradient = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(70, 45, 30, 0.42)');
  gradient.addColorStop(0.55, 'rgba(70, 45, 30, 0.16)');
  gradient.addColorStop(1, 'rgba(70, 45, 30, 0)');
  g.fillStyle = gradient;
  g.fillRect(0, 0, size, size);
  const blobTexture = new THREE.CanvasTexture(canvas);
  const blob = new THREE.Mesh(
    new THREE.PlaneGeometry(2.9, 2.1),
    new THREE.MeshBasicMaterial({ map: blobTexture, transparent: true, depthWrite: false }),
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.set(0, SIZE.groundY + 0.004, 0.12);
  group.add(catcher, blob);
  return group;
}

// A soft photo-studio environment (warm floor, bright softboxes) baked once for reflections.
function studioEnvironment(renderer) {
  const env = new THREE.Scene();
  const dome = new THREE.SphereGeometry(10, 32, 16);
  const colors = [];
  const position = dome.attributes.position;
  const top = new THREE.Color('#ffffff');
  const bottom = new THREE.Color('#b9aa9e');
  const color = new THREE.Color();
  for (let i = 0; i < position.count; i += 1) {
    const t = (position.getY(i) / 10 + 1) / 2;
    color.copy(bottom).lerp(top, smooth(0.25, 0.7, t));
    colors.push(color.r, color.g, color.b);
  }
  dome.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  env.add(new THREE.Mesh(dome, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const panel = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 2.5, 2.3) });
  for (const [x, y, z, w, h] of [[-5, 5, 5, 5, 3], [6, 2, 3, 3, 4], [0, 6, -6, 6, 2]]) {
    const box = new THREE.Mesh(new THREE.PlaneGeometry(w, h), panel);
    box.position.set(x, y, z);
    box.lookAt(0, 1.5, 0);
    env.add(box);
  }
  const generator = new THREE.PMREMGenerator(renderer);
  const target = generator.fromScene(env, 0.02);
  generator.dispose();
  return target.texture;
}

// ---------- scene ----------
export function createCat3D(container, { transparent = true, sway = true } = {}) {
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: transparent, premultipliedAlpha: true });
  if (!renderer.getContext()) {
    throw new Error('WebGL unavailable');
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x000000, 0);
  canvas.className = 'cat3d';
  canvas.setAttribute('aria-hidden', 'true');
  container.append(canvas);

  const scene = new THREE.Scene();
  scene.environment = studioEnvironment(renderer);
  scene.environmentIntensity = 0.55;
  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 60);
  const target = new THREE.Vector3(0, 1.86, 0);

  // Warm key light from the upper left, a cool fill and a rim light so the glaze reads as round.
  scene.add(new THREE.HemisphereLight(0xffffff, 0xc9b8aa, 0.8));
  const key = new THREE.DirectionalLight(0xfff2e2, 1.85);
  key.position.set(-3.5, 6, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -3;
  key.shadow.camera.right = 3;
  key.shadow.camera.top = 4.5;
  key.shadow.camera.bottom = -1.5;
  key.shadow.radius = 5;
  key.shadow.bias = -0.0008;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xdfe8ff, 0.55);
  fill.position.set(4, 2.5, 3);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffe2b0, 1.1);
  rim.position.set(1.5, 4, -5);
  scene.add(rim);

  const root = new THREE.Group();
  scene.add(root);
  const { cat, shoulder, wrist, pawTip, head, eyes, happyEyes, ears, tail } = buildCat();
  root.add(cat, buildGround());

  // Straight-on view, a touch from above: Hoki looks right at you.
  const view = { yaw: 0, pitch: 0.12, distance: 10.6 };
  function placeCamera(extraYaw = 0, extraPitch = 0) {
    const yaw = view.yaw + extraYaw;
    const pitch = view.pitch + extraPitch;
    camera.position.set(
      target.x + Math.sin(yaw) * Math.cos(pitch) * view.distance,
      target.y + Math.sin(pitch) * view.distance,
      target.z + Math.cos(yaw) * Math.cos(pitch) * view.distance,
    );
    camera.lookAt(target);
  }

  function resize() {
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  resize();
  const observer = new ResizeObserver(() => {
    resize();
    render();
  });
  observer.observe(container);

  let fold = 0;
  let time = 0;
  let hop = 1;
  // Interaction state: where the pointer is (-1..1), how happy Hoki is, petting and blinking.
  const pointer = { x: 0, y: 0, tx: 0, ty: 0, active: false, lastX: 0, lastY: 0 };
  let happy = 0;          // seconds of '^ ^' eyes left (tap)
  let pet = 0;            // 0..1, rises while you stroke its head
  let earTwitch = 0;      // seconds left of an ear flick
  let nextBlink = 2.5;
  let blinkAge = 1;
  const interactive = sway;
  let forcedHappy = false;   // previews and widget frames can show the '^ ^' face

  container.addEventListener('pointermove', (event) => {
    if (!interactive) {
      return;
    }
    const rect = container.getBoundingClientRect();
    const nx = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
    const ny = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
    // Stroking the upper half (the head) pets Hoki; speed decides how much.
    if (pointer.active && ny < 0.05 && Math.abs(nx) < 0.75) {
      const travel = Math.hypot(nx - pointer.lastX, ny - pointer.lastY);
      pet = Math.min(1, pet + travel * 1.6);
    }
    pointer.tx = nx;
    pointer.ty = ny;
    pointer.lastX = nx;
    pointer.lastY = ny;
    pointer.active = true;
  });
  container.addEventListener('pointerleave', () => {
    pointer.tx = 0;
    pointer.ty = 0;
    pointer.active = false;
  });

  function pose(dt) {
    // Front-to-back beckon: both joints turn about X (toward the viewer), never sideways.
    wrist.rotation.x = fold * BECKON.wrist;
    shoulder.rotation.x = 0.12 + fold * BECKON.arm;
    const bob = interactive ? Math.sin(time * 1.3) * 0.012 : 0;
    cat.position.y = bob + Math.sin(Math.min(1, hop) * Math.PI) * 0.14;

    // Where Hoki looks: at the pointer, or a slow idle glance around when nobody is there.
    pointer.x += (pointer.tx - pointer.x) * 0.1;
    pointer.y += (pointer.ty - pointer.y) * 0.1;
    let lookX = 0;
    let lookY = 0;
    if (interactive) {
      if (pointer.active) {
        lookX = pointer.x;
        lookY = pointer.y + 0.35;   // the head sits in the upper part of the box
      } else {
        lookX = Math.sin(time * 0.37) * 0.35;
        lookY = Math.sin(time * 0.23) * 0.15;
      }
    }
    lookX = Math.max(-1, Math.min(1, lookX));
    lookY = Math.max(-1, Math.min(1, lookY));
    const petting = smooth(0.25, 0.6, pet);
    head.rotation.y = lookX * 0.32;
    head.rotation.x = lookY * 0.16 - fold * 0.04 + petting * 0.08;
    head.rotation.z = (interactive ? Math.sin(time * 0.8) * 0.03 : 0) - lookX * 0.05 + petting * 0.14;
    for (const eye of eyes) {
      eye.position.x = lookX * 0.035;
      eye.position.y = -lookY * 0.03;
    }

    // Blink every few seconds (a quick squash of the eyes).
    let openness = 1;
    if (interactive) {
      blinkAge += dt;
      nextBlink -= dt;
      if (nextBlink <= 0) {
        blinkAge = 0;
        nextBlink = 2.2 + Math.random() * 3.2;
      }
      if (blinkAge < 0.16) {
        openness = 1 - Math.sin((blinkAge / 0.16) * Math.PI) * 0.92;
      }
    }
    const showHappy = forcedHappy || happy > 0 || petting > 0.5;
    for (const eye of eyes) {
      eye.scale.y = openness;
      eye.visible = !showHappy;
    }
    for (const arc of happyEyes) {
      arc.visible = showHappy;
    }

    // Ears flick after a tap and fold back softly while being petted.
    const flick = earTwitch > 0 ? Math.sin(earTwitch * 40) * 0.18 * (earTwitch / 0.45) : 0;
    for (const ear of ears) {
      const { side, baseX, baseZ } = ear.userData;
      ear.rotation.x = baseX - petting * 0.35 + (side > 0 ? flick : flick * 0.6);
      ear.rotation.z = baseZ - side * petting * 0.12;
    }

    // Tail sways lazily, faster when Hoki is happy.
    const wag = interactive ? Math.sin(time * (showHappy ? 6 : 1.6)) * (showHappy ? 0.22 : 0.1) : 0;
    tail.rotation.y = wag;
    tail.rotation.z = wag * 0.4;

    happy = Math.max(0, happy - dt);
    earTwitch = Math.max(0, earTwitch - dt);
    pet = Math.max(0, pet - dt * 0.45);
  }

  function render(dt = 0) {
    pose(dt);
    const idle = interactive ? Math.sin(time * 0.35) * 0.03 : 0;
    placeCamera(idle - pointer.x * 0.04, pointer.y * 0.02);
    renderer.render(scene, camera);
  }

  const projected = new THREE.Vector3();
  return {
    canvas,
    // fold: 0 = paw raised and open, 1 = folded toward the viewer.
    update(nextFold, dt = 0) {
      fold = nextFold;
      time += dt;
      if (hop < 1) {
        hop = Math.min(1, hop + dt * 4.5);
      }
      render(dt);
    },
    // A tap: a little hop, happy '^ ^' eyes and an ear flick.
    hop() {
      hop = 0;
      if (interactive) {
        happy = 0.9;
        earTwitch = 0.45;
      }
    },
    setHappy(on) {
      forcedHappy = Boolean(on);
      render();
    },
    // 0..1 how much Hoki is being petted right now (the app can purr or count it).
    petting() {
      return smooth(0.25, 0.6, pet);
    },
    // Cheaper render for slow GPUs: 1x pixels and no soft shadows.
    lighten() {
      renderer.setPixelRatio(1);
      renderer.shadowMap.enabled = false;
      resize();
    },
    pose() {
      return { wristX: wrist.rotation.x, wristZ: wrist.rotation.z, armX: shoulder.rotation.x };
    },
    // Screen position of the paw tip (for the +1 floaters), in client pixels.
    pawPoint() {
      pawTip.getWorldPosition(projected).project(camera);
      const rect = canvas.getBoundingClientRect();
      return { x: rect.left + ((projected.x + 1) / 2) * rect.width, y: rect.top + ((1 - projected.y) / 2) * rect.height };
    },
    dispose() {
      observer.disconnect();
      renderer.dispose();
      canvas.remove();
    },
  };
}
