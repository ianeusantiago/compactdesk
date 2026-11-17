import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { Album } from "./data";
import { grainTex, woodTex } from "./retro";

const std = (color: string, rough = 0.7, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: rough, map: grainTex(), ...extra }); // granulado retrô em tudo
const rbox = (w: number, h: number, d: number, r: number, mat: THREE.Material) => {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, r), mat);
  m.castShadow = m.receiveShadow = true;
  return m;
};
const lathe = (pts: [number, number][], mat: THREE.Material, seg = 28) => {
  const m = new THREE.Mesh(new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg), mat);
  m.castShadow = m.receiveShadow = true;
  return m;
};
function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// =====================================================================
// Quadrinhos com capas
// =====================================================================
const GENERIC: ((g: CanvasRenderingContext2D) => void)[] = [
  (g) => { g.fillStyle = "#efe6d6"; g.fillRect(0, 0, 128, 128); g.fillStyle = "#d9603b"; g.beginPath(); g.arc(64, 70, 34, 0, 7); g.fill(); g.fillStyle = "#1f3b5a"; g.fillRect(0, 96, 128, 32); },
  (g) => { g.fillStyle = "#1f2a44"; g.fillRect(0, 0, 128, 128); g.strokeStyle = "#e8c64e"; g.lineWidth = 6; for (let r = 12; r < 70; r += 14) { g.beginPath(); g.arc(64, 64, r, 0, 7); g.stroke(); } },
  (g) => { g.fillStyle = "#dfe8e1"; g.fillRect(0, 0, 128, 128); g.fillStyle = "#3f7d5c"; g.fillRect(20, 20, 40, 88); g.fillStyle = "#f2b8a2"; g.fillRect(68, 50, 40, 58); },
  (g) => { g.fillStyle = "#f3d9c4"; g.fillRect(0, 0, 128, 128); g.fillStyle = "#8a3d5c"; g.beginPath(); g.moveTo(0, 128); g.lineTo(64, 30); g.lineTo(128, 128); g.fill(); },
];

export function buildFrames(albums: Album[]): THREE.Group {
  const g = new THREE.Group();
  const real = albums.filter((a) => !a.demo && a.urls?.front);
  const loader = new THREE.TextureLoader();
  const frameMat = std("#1d1b18", 0.4);
  const passe = std("#f7f4ec", 0.9);
  const spots: [number, number, number][] = [[-0.36, 0.36, 0.5], [0.3, 0.42, 0.42], [-0.32, -0.3, 0.42], [0.34, -0.26, 0.5]];
  spots.forEach(([x, y, size], i) => {
    const f = new THREE.Group();
    f.position.set(x, y, 0);
    f.rotation.z = (i % 2 ? 1 : -1) * 0.012;
    f.add(rbox(size, size, 0.03, 0.004, frameMat));
    const p = new THREE.Mesh(new THREE.PlaneGeometry(size * 0.86, size * 0.86), passe);
    p.position.z = 0.016; f.add(p);
    const a = real[i];
    const tex = a ? loader.load(a.urls!.front!) : canvasTex(128, 128, GENERIC[i % GENERIC.length]);
    tex.colorSpace = THREE.SRGBColorSpace;
    const art = new THREE.Mesh(new THREE.PlaneGeometry(size * 0.66, size * 0.66), std("#ffffff", 0.6, { map: tex }));
    art.position.z = 0.017; f.add(art);
    g.add(f);
  });
  return g;
}

// =====================================================================
// Decorações (modelos refeitos)
// =====================================================================
function leafGeometry(len: number, wid: number) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(wid, len * 0.25, wid * 0.8, len * 0.75, 0, len);
  s.bezierCurveTo(-wid * 0.8, len * 0.75, -wid, len * 0.25, 0, 0);
  const geo = new THREE.ShapeGeometry(s, 8);
  // curva a folha para trás
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i), x = pos.getX(i);
    pos.setZ(i, -Math.pow(y / len, 2) * len * 0.35 - Math.abs(x) * 0.25);
  }
  geo.computeVertexNormals();
  return geo;
}

export const DECOR_BUILD: Record<string, () => THREE.Object3D> = {
  planta() {
    const g = new THREE.Group();
    const pot = lathe([[0, 0], [0.1, 0], [0.12, 0.03], [0.14, 0.2], [0.155, 0.21], [0.155, 0.24], [0.14, 0.24], [0.13, 0.22]], std("#e8e2d6", 0.55, { map: grainTex("clay") }));
    const soil = new THREE.Mesh(new THREE.CircleGeometry(0.13, 20), std("#3b2a1e", 1, { map: grainTex("soil") }));
    soil.rotation.x = -Math.PI / 2; soil.position.y = 0.215;
    g.add(pot, soil);
    const leafMat = [std("#3f7f45", 0.6, { side: THREE.DoubleSide, map: grainTex("leaf") }), std("#5a9b56", 0.6, { side: THREE.DoubleSide, map: grainTex("leaf") })];
    for (let i = 0; i < 14; i++) {
      const len = 0.28 + (i % 4) * 0.07;
      const leaf = new THREE.Mesh(leafGeometry(len, 0.07 + (i % 3) * 0.015), leafMat[i % 2]);
      const a = i * 2.4;
      leaf.position.set(Math.cos(a) * 0.02, 0.22, Math.sin(a) * 0.02);
      leaf.rotation.set(0, -a + Math.PI / 2, 0);
      leaf.rotateX(-0.25 - (i % 4) * 0.18);
      leaf.castShadow = true;
      g.add(leaf);
    }
    return g;
  },
  cacto() {
    const g = new THREE.Group();
    const pot = lathe([[0, 0], [0.13, 0], [0.16, 0.26], [0.17, 0.26], [0.17, 0.29], [0, 0.29]], std("#c97a52", 0.85, { map: grainTex("clay") }));
    g.add(pot);
    const green = std("#4f8f55", 0.7, { map: grainTex("leaf") });
    const seg = (r: number, h: number, x: number, y: number, rz = 0) => {
      const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, h, 4, 12), green);
      m.position.set(x, y, 0); m.rotation.z = rz; m.castShadow = true; g.add(m);
    };
    seg(0.075, 0.48, 0, 0.6);
    seg(0.045, 0.16, 0.13, 0.66); seg(0.045, 0.1, 0.085, 0.56, Math.PI / 2);
    seg(0.04, 0.12, -0.12, 0.74); seg(0.04, 0.08, -0.08, 0.66, Math.PI / 2);
    return g;
  },
  quadro() {
    const g = new THREE.Group();
    g.add(rbox(0.95, 0.7, 0.04, 0.006, std("#2a2a2a", 0.4)));
    const art = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.6), std("#ffffff", 0.9, { map: canvasTex(128, 96, (x) => {
      x.fillStyle = "#f2efe8"; x.fillRect(0, 0, 128, 96);
      x.fillStyle = "#e66a4f"; x.beginPath(); x.arc(46, 48, 26, 0, 7); x.fill();
      x.fillStyle = "#2f5f8a"; x.fillRect(70, 20, 34, 56);
      x.fillStyle = "#e8c24a"; x.fillRect(20, 76, 90, 6);
    }) }));
    art.position.z = 0.021; g.add(art);
    return g;
  },
  luminaria() {
    const g = new THREE.Group();
    const metal = std("#1d1d1f", 0.35, { metalness: 0.6 });
    g.add(lathe([[0, 0], [0.11, 0], [0.11, 0.015], [0.05, 0.03], [0, 0.03]], metal));
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.42, 8), metal);
    arm.position.set(0.04, 0.22, 0); arm.rotation.z = -0.2; g.add(arm);
    const shade = lathe([[0.04, 0], [0.15, -0.14], [0.152, -0.15], [0.05, 0.01]], std("#efe5cf", 0.6, { side: THREE.DoubleSide, emissive: "#ffcf8a", emissiveIntensity: 0.15 }));
    shade.position.set(0.085, 0.47, 0); g.add(shade);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), std("#fff6dd", 0.2, { emissive: "#ffd79a", emissiveIntensity: 2 }));
    bulb.position.set(0.085, 0.4, 0); g.add(bulb);
    const light = new THREE.PointLight("#ffd29a", 3, 2.5); light.position.set(0.085, 0.36, 0); g.add(light);
    return g;
  },
  tapete() {
    const m = new THREE.Mesh(new THREE.CircleGeometry(1.4, 48), std("#ffffff", 1, { map: canvasTex(256, 256, (x) => {
      x.fillStyle = "#efe7da"; x.fillRect(0, 0, 256, 256);
      x.strokeStyle = "#b9876a"; x.lineWidth = 10;
      for (let r = 26; r < 128; r += 30) { x.beginPath(); x.arc(128, 128, r, 0, 7); x.stroke(); }
      for (let i = 0; i < 4000; i++) { x.fillStyle = `rgba(80,50,30,${Math.random() * 0.06})`; x.fillRect(Math.random() * 256, Math.random() * 256, 1, 1); }
    }) }));
    m.rotation.x = -Math.PI / 2; m.receiveShadow = true;
    return m;
  },
  caixa_som() {
    const g = new THREE.Group();
    const cab = rbox(0.4, 0.66, 0.36, 0.02, std("#ffffff", 0.55, { map: woodTex("#5c3d27") })); cab.position.y = 0.33 + 0.04;
    const baffle = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.62), std("#1b1b1d", 0.8));
    baffle.position.set(0, 0.37, 0.181);
    g.add(cab, baffle);
    const driver = (r: number, y: number) => {
      const d = new THREE.Group();
      d.position.set(0, y, 0.182);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.12, 8, 32), std("#2a2a2c", 0.35, { metalness: 0.4 }));
      const cone = lathe([[r * 0.95, 0], [r * 0.35, -r * 0.35], [0, -r * 0.35]], std("#141416", 0.9, { side: THREE.DoubleSide }), 32);
      cone.rotation.x = -Math.PI / 2;
      const cap = new THREE.Mesh(new THREE.SphereGeometry(r * 0.3, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), std("#2c2c30", 0.4));
      cap.rotation.x = Math.PI / 2; cap.position.z = -r * 0.3;
      d.add(ring, cone, cap);
      g.add(d);
    };
    driver(0.13, 0.27); driver(0.045, 0.56);
    for (const x of [-0.15, 0.15]) for (const z of [-0.13, 0.13]) {
      const f = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.04, 10), std("#111", 0.4));
      f.position.set(x, 0.02, z); g.add(f);
    }
    return g;
  },
  neon() {
    const g = new THREE.Group();
    const mat = std("#ff6fb5", 0.3, { emissive: "#ff4fa6", emissiveIntensity: 2.2 });
    g.add(new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.018, 8, 40), mat), new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.015, 8, 20), mat));
    const back = rbox(0.7, 0.7, 0.02, 0.01, new THREE.MeshPhysicalMaterial({ color: "#fff", transparent: true, opacity: 0.12, roughness: 0.1 }));
    back.position.z = -0.03; g.add(back);
    const glow = new THREE.PointLight("#ff6fb5", 2.5, 2.2); glow.position.z = 0.25; g.add(glow);
    return g;
  },
  gato() {
    const g = new THREE.Group();
    const fur = std("#f0a35a", 0.85, { map: grainTex("fabric") });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.16, 4, 12), fur);
    body.rotation.z = Math.PI / 2; body.position.y = 0.08;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 12), fur); head.position.set(0.15, 0.17, 0);
    const ears = [-1, 1].map((s) => { const e = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.06, 4), fur); e.position.set(0.15, 0.25, s * 0.04); return e; });
    const tail = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.016, 6, 16, Math.PI), fur);
    tail.position.set(-0.17, 0.1, 0); tail.rotation.z = Math.PI / 2;
    for (const m of [body, head, tail, ...ears]) { m.castShadow = true; g.add(m); }
    g.rotation.y = -0.4;
    return g;
  },
};
