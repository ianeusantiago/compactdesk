import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { Album } from "./data";

// Jewel case padrão: 142 × 125 × 10,4 mm. Encarte da frente 120 × 120 mm.
// Encarte traseiro 151 × 118 mm = 138 mm de verso + 6,5 mm de lombada de cada lado.
const MM = 0.0062;
export const W = 142 * MM, H = 125 * MM, D = 10.4 * MM;
const BOOK = 120 * MM;
const SPINE_FRAC = 6.5 / 151;

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function hash(s: string) {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h);
}
function palette(a: Album): [string, string] {
  const h = hash(a.title + a.artist) % 360;
  return [`hsl(${h} 70% 62%)`, `hsl(${(h + 40) % 360} 55% 18%)`];
}

function fallbackFront(a: Album) {
  const [c1, c2] = palette(a);
  return canvasTex(512, 512, (g) => {
    const grd = g.createLinearGradient(0, 0, 512, 512);
    grd.addColorStop(0, c1); grd.addColorStop(1, c2);
    g.fillStyle = grd; g.fillRect(0, 0, 512, 512);
    g.fillStyle = "rgba(255,255,255,.92)";
    g.font = "bold 40px 'Barlow Condensed', sans-serif"; g.fillText(a.title.slice(0, 18), 32, 430);
    g.font = "28px 'Barlow', sans-serif"; g.fillText(a.artist.slice(0, 24), 32, 474);
  });
}

function trackPage(a: Album, w: number, h: number, withBarcode: boolean) {
  return canvasTex(w, h, (g) => {
    g.fillStyle = "#f4f2ee"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#222"; g.font = "bold 18px 'Barlow Condensed', sans-serif";
    g.fillText(a.title.slice(0, 34), 40, 50);
    g.font = "13px 'Barlow', sans-serif";
    a.tracks.slice(0, 18).forEach((t, i) => {
      g.fillText(`${t.position.padEnd(4)} ${t.title.slice(0, 32)}`, 40, 84 + i * 17);
      g.fillText(t.duration, w - 80, 84 + i * 17);
    });
    if (!withBarcode) return;
    const code = a.barcode || String(Math.abs(a.id)).padStart(12, "0");
    let x = w - 150;
    for (const ch of code.slice(0, 13)) {
      const n = Number(ch) || 3;
      for (let k = 0; k < 4; k++) { g.fillRect(x, h - 80, 1 + ((n + k) % 3), 46); x += 3 + ((n * k) % 2); }
    }
    g.font = "11px monospace"; g.fillText(code, w - 150, h - 20);
    g.fillText([a.label, a.catno, a.country, a.year].filter(Boolean).join(" · ").slice(0, 46), 40, h - 20);
  });
}

/** Lombada gerada: faixa de cor da capa + "ARTISTA — ÁLBUM" de baixo pra cima. */
function fallbackSpine(a: Album) {
  const [c1] = palette(a);
  return canvasTex(48, 560, (g) => {
    g.fillStyle = "#f4f2ee"; g.fillRect(0, 0, 48, 560);
    g.fillStyle = c1; g.fillRect(6, 14, 36, 6); // fio de cor discreto no topo
    g.save(); g.translate(31, 535); g.rotate(-Math.PI / 2);
    g.fillStyle = "#1a1a1a"; g.font = "bold 19px 'Barlow Condensed', Arial, sans-serif";
    g.fillText(`${a.artist}  —  ${a.title}`.toUpperCase().slice(0, 40), 0, 0);
    g.restore();
  });
}

const loader = new THREE.TextureLoader();
function load(url: string, onLoad?: (t: THREE.Texture) => void) {
  const t = loader.load(url, onLoad);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// ---------- Materiais compartilhados ----------
const acrylic = new THREE.MeshPhysicalMaterial({
  color: "#ffffff", transparent: true, opacity: 0.1, roughness: 0.02, metalness: 0,
  clearcoat: 1, clearcoatRoughness: 0.01, envMapIntensity: 1.4,
  side: THREE.DoubleSide, depthWrite: false,
});
const edgeMat = new THREE.LineBasicMaterial({ color: "#e9f0f7", transparent: true, opacity: 0.4 });
const pinMat = new THREE.MeshPhysicalMaterial({ color: "#f2f6fa", transparent: true, opacity: 0.45, roughness: 0.05, clearcoat: 1 });
const trayBlack = new THREE.MeshStandardMaterial({ color: "#16171b", roughness: 0.35, metalness: 0.1 });
const silver = new THREE.MeshPhysicalMaterial({
  color: "#f0f3fa", metalness: 1, roughness: 0.08, iridescence: 1, iridescenceIOR: 1.8,
  iridescenceThicknessRange: [200, 800],
});

/** Texto curvado ao longo de um arco (top = em cima lendo da esquerda pra direita). */
function arcText(g: CanvasRenderingContext2D, text: string, r: number, top: boolean) {
  const c = g.canvas.width / 2;
  const widths = [...text].map((ch) => g.measureText(ch).width);
  const total = widths.reduce((s, w) => s + w, 0);
  let ang = (top ? -Math.PI / 2 : Math.PI / 2) + (top ? -1 : 1) * total / r / 2;
  [...text].forEach((ch, i) => {
    const step = widths[i] / r;
    const a = ang + (top ? step / 2 : -step / 2);
    g.save();
    g.translate(c + Math.cos(a) * r, c + Math.sin(a) * r);
    g.rotate(a + (top ? Math.PI / 2 : -Math.PI / 2));
    g.fillText(ch, -widths[i] / 2, 0);
    g.restore();
    ang += top ? step : -step;
  });
}

/** CD prensado sem arte: cromado com a serigrafia do nome do álbum. A cor branca deixa o metal aparecer. */
function printedDisc(a: Album) {
  const [accent] = palette(a);
  return canvasTex(1024, 1024, (g) => {
    const c = 512, R = 512, mm = R / 60;
    g.fillStyle = "#ffffff"; g.fillRect(0, 0, 1024, 1024);
    // área de fixação (plástico) e anel espelhado interno
    g.fillStyle = "#d9dde3"; g.beginPath(); g.arc(c, c, 17 * mm, 0, 7); g.fill();
    g.strokeStyle = "#bfc5cc"; g.lineWidth = 2;
    for (const r of [17, 20.5, 23]) { g.beginPath(); g.arc(c, c, r * mm, 0, 7); g.stroke(); }
    // serigrafia
    g.fillStyle = "#1c1c1f";
    g.font = `600 ${3.6 * mm}px 'Barlow Condensed', sans-serif`;
    arcText(g, a.title.toUpperCase().slice(0, 40), 46 * mm, true);
    g.font = `500 ${2.6 * mm}px 'Barlow Condensed', sans-serif`;
    arcText(g, a.artist.toUpperCase().slice(0, 40), 49 * mm, false);
    g.font = `500 ${1.5 * mm}px 'Barlow', sans-serif`;
    arcText(g, [a.label, a.catno, a.year && `℗ ${a.year}`].filter(Boolean).join("  ·  ").slice(0, 70), 54.5 * mm, false);
    g.font = `600 ${1.6 * mm}px 'Barlow Condensed', sans-serif`;
    g.textAlign = "center";
    g.fillText("DIGITAL  AUDIO", c, c + 30 * mm);
    g.fillText(a.country ? `MADE IN ${a.country.toUpperCase()}` : "", c, c + 33 * mm);
    g.textAlign = "left";
    // fio de cor e anel de borda
    g.strokeStyle = accent; g.lineWidth = 0.7 * mm;
    g.beginPath(); g.arc(c, c, 40 * mm, 0, 7); g.stroke();
    g.strokeStyle = "#1c1c1f"; g.lineWidth = 0.25 * mm;
    g.beginPath(); g.arc(c, c, 57.5 * mm, 0, 7); g.stroke();
  });
}

const hubRing =new THREE.MeshPhysicalMaterial({ color: "#dfe5ec", metalness: 0, roughness: 0.2, transmission: 0.6, transparent: true, opacity: 0.6 });

function acrylicBox(w: number, h: number, d: number) {
  const g = new RoundedBoxGeometry(w, h, d, 2, Math.min(d * 0.3, 0.004));
  const m = new THREE.Mesh(g, acrylic);
  m.renderOrder = 2;
  m.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)), edgeMat));
  return m;
}

export type CaseMesh = { root: THREE.Group; lid: THREE.Group; disc: THREE.Object3D };

export function buildCase(a: Album): CaseMesh {
  const u = a.urls ?? {};
  const root = new THREE.Group();

  // ---------- Base ----------
  const baseD = D * 0.62;
  const baseZ = -D / 2 + baseD / 2;
  const base = acrylicBox(W, H, baseD);
  base.position.z = baseZ;
  root.add(base);

  // contracapa + lombadas: se a foto do Discogs inclui as lombadas (151:118), recorta delas
  const backMat = new THREE.MeshStandardMaterial({ roughness: 0.6 });
  const spineL = new THREE.MeshStandardMaterial({ roughness: 0.6, map: fallbackSpine(a) });
  const spineR = new THREE.MeshStandardMaterial({ roughness: 0.6, map: spineL.map });
  if (u.back) {
    backMat.map = load(u.back, (t) => {
      const img = t.image as HTMLImageElement;
      if (img.width / img.height < 1.2) return; // sem lombadas na foto
      t.repeat.x = 1 - SPINE_FRAC * 2; t.offset.x = SPINE_FRAC; t.needsUpdate = true;
      for (const [mat, off] of [[spineL, 1 - SPINE_FRAC], [spineR, 0]] as const) {
        const s = t.clone();
        s.repeat.x = SPINE_FRAC; s.offset.x = off; s.needsUpdate = true;
        mat.map = s; mat.needsUpdate = true;
      }
    });
  } else backMat.map = trackPage(a, 512, 420, true);
  const backInsert = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.95, H * 0.95), backMat);
  backInsert.position.z = -D / 2 + 0.0025;
  backInsert.rotation.y = Math.PI;
  root.add(backInsert);
  // lado esquerdo = dobradiça (lombada principal, a que aparece na estante)
  for (const [side, mat] of [[-1, spineL], [1, spineR]] as const) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(D * 0.9, H * 0.95), mat);
    s.position.set(side * (W / 2 - 0.0025), 0, 0);
    s.rotation.y = side * Math.PI / 2;
    root.add(s);
  }

  // bandeja: preta, ou transparente mostrando a arte de baixo do disco
  const trayZ = baseZ + baseD / 2 - 0.008;
  const tray = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.9, H * 0.93), u.tray
    ? new THREE.MeshStandardMaterial({ map: load(u.tray), roughness: 0.6 })
    : trayBlack);
  tray.position.z = trayZ;
  root.add(tray);

  // disco (com a arte do Discogs quando existir)
  const discG = new THREE.Group();
  const cx = W * 0.045;
  discG.position.set(cx, 0, trayZ + 0.006);
  const discFace = new THREE.Mesh(new THREE.RingGeometry(7.5 * MM, 60 * MM, 64, 1),
    u.disc
      ? new THREE.MeshStandardMaterial({ map: load(u.disc), roughness: 0.35, metalness: 0.15 })
      : new THREE.MeshPhysicalMaterial({
          map: printedDisc(a), metalness: 1, roughness: 0.16, envMapIntensity: 1.8,
          iridescence: 0.7, iridescenceIOR: 1.8, iridescenceThicknessRange: [200, 800],
        }));
  const discBack = new THREE.Mesh(new THREE.RingGeometry(7.5 * MM, 60 * MM, 64, 1), silver);
  discBack.rotation.y = Math.PI; discBack.position.z = -0.001;
  const hub = new THREE.Mesh(new THREE.RingGeometry(3 * MM, 18 * MM, 24), hubRing);
  hub.position.z = -0.002;
  discG.add(discFace, discBack, hub);
  root.add(discG);

  // ---------- Tampa (gira na dobradiça da esquerda) ----------
  const lid = new THREE.Group();
  const lidD = D * 0.34;
  lid.position.set(-W / 2, 0, D / 2 - lidD / 2);
  const shell = acrylicBox(W, H, lidD);
  shell.position.x = W / 2;
  lid.add(shell);
  // encarte da frente, preso pelas abas à direita
  const bx = W - BOOK / 2 - 2 * MM;
  const booklet = new THREE.Mesh(new THREE.PlaneGeometry(BOOK, BOOK),
    new THREE.MeshStandardMaterial({ map: u.front ? load(u.front) : fallbackFront(a), roughness: 0.5 }));
  booklet.position.set(bx, 0, -lidD / 2 + 0.0035);
  lid.add(booklet);
  // verso do encarte (aparece quando abre)
  const inner = new THREE.Mesh(new THREE.PlaneGeometry(BOOK, BOOK),
    new THREE.MeshStandardMaterial({ map: u.inner ? load(u.inner) : trackPage(a, 512, 512, false), roughness: 0.6 }));
  inner.rotation.y = Math.PI;
  inner.userData.booklet = true; // clicável: abre o folheador
  inner.position.set(bx, 0, -lidD / 2 + 0.003);
  lid.add(inner);
  // abas que prendem o encarte
  for (const y of [-1, 1]) {
    const tab = new THREE.Mesh(new THREE.BoxGeometry(5 * MM, 9 * MM, 1.2 * MM), pinMat);
    tab.position.set(W - 3 * MM, y * 32 * MM, -lidD / 2 + 0.002);
    lid.add(tab);
  }
  // dobradiças discretas, de acrílico
  for (const y of [-1, 1]) {
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(1.4 * MM, 1.4 * MM, 10 * MM, 10), pinMat);
    pin.position.set(1.2 * MM, y * (H / 2 - 7 * MM), -lidD / 2);
    lid.add(pin);
  }
  root.add(lid);

  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && (o as THREE.Mesh).material !== acrylic) o.castShadow = true;
  });
  return { root, lid, disc: discG };
}
