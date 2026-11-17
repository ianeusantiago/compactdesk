import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { buildCase, W, H, D } from "./case";
import { FINISHES, SCENES, type Album, type Settings } from "./data";
import { DECOR_BUILD, buildFrames } from "./props";
import { buildTV, type TV } from "./tv";
import { floorTex, grainTex, retroMat, wallTex, woodTex } from "./retro";

const tiled = (t: THREE.Texture, x: number, y: number) => { const c = t.clone(); c.repeat.set(x, y); c.needsUpdate = true; return c; };

export type CD = {
  album: Album; root: THREE.Group; lid: THREE.Group; disc: THREE.Object3D;
  home: THREE.Vector3; baseRot: THREE.Euler; hover: number; phase: number;
};
/** Objeto que dá para arrastar no modo Organizar: no chão, na parede ou em cima da estante. */
export type Placeable = { id: string; obj: THREE.Object3D; kind: "floor" | "wall" | "top" };
export type World = {
  group: THREE.Group; cds: CD[]; placeables: Placeable[];
  width: number; height: number; floorY: number; wallZ: number; topY: number; roomHalf: number; shelfBox: THREE.Box3;
  slotCount: number; slotHome: (slot: number) => { home: THREE.Vector3; rot: THREE.Euler };
  slotAt: (p: THREE.Vector3) => number; hidden: number; tick: (t: number) => void; tv: TV;
};

function woodTexture(color: string, grain: boolean) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = color; g.fillRect(0, 0, 256, 256);
  if (grain) {
    for (let y = 0; y < 256; y++) {
      const v = Math.sin(y * 0.22 + Math.sin(y * 0.05) * 5) * 0.5 + 0.5;
      g.fillStyle = `rgba(60,35,15,${v * 0.14})`;
      g.fillRect(0, y, 256, 1);
    }
    for (let i = 0; i < 3; i++) {
      g.strokeStyle = "rgba(70,40,20,.16)";
      g.beginPath(); g.ellipse(Math.random() * 256, Math.random() * 256, 14, 4, 0, 0, 7); g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
const std = (color: string, rough = 0.8) => new THREE.MeshStandardMaterial({ color, roughness: rough });

export function buildWorld(s: Settings, albums: Album[]): World {
  const group = new THREE.Group();
  const scene = SCENES[s.scene] ?? SCENES.estudio;
  const finish = FINISHES[s.finish] ?? FINISHES.carvalho;
  const woodColor = s.customColor || finish.color;
  // madeira pixelada (acabamentos lisos usam só o granulado)
  const grained = finish.grain && !s.customColor;
  const wood = new THREE.MeshStandardMaterial({ map: grained ? tiled(woodTex(woodColor), 2, 1) : grainTex("plastic"), color: grained ? "#ffffff" : woodColor, roughness: 0.62 });
  const woodEdge = new THREE.MeshStandardMaterial({ map: grained ? woodTex(woodColor) : grainTex("plastic"), color: grained ? "#d6d1cb" : new THREE.Color(woodColor).multiplyScalar(0.82), roughness: 0.6 });

  // ---------- Estante (painéis com cantos arredondados) ----------
  const spine = s.display === "lombada";
  const T = 0.045, depth = spine ? W + 0.1 : 0.5;
  const cellW = W + 0.12, rowH = H + 0.2;
  const innerW = s.slots * cellW;
  const height = s.rows * rowH + T * (s.rows + 1);
  const width = innerW + T * 2;
  const plinth = 0.07;
  const floorY = -height / 2 - plinth;
  const wallZ = -depth / 2 - 0.012;
  const topY = height / 2;

  const shelf = new THREE.Group();
  const panel = (w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material = wood) => {
    const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(w, h, d) * 0.35), mat);
    m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; shelf.add(m);
  };
  panel(width - 0.01, height, 0.018, 0, 0, -depth / 2 + 0.009, woodEdge); // fundo
  panel(T, height, depth, -width / 2 + T / 2, 0, 0);
  panel(T, height, depth, width / 2 - T / 2, 0, 0);
  for (let r = 0; r <= s.rows; r++) panel(innerW + 0.002, T, depth - 0.004, 0, -height / 2 + T / 2 + r * (rowH + T), 0.002);
  panel(width, T * 0.7, 0.015, 0, topY - T * 0.35, depth / 2 + 0.006, woodEdge); // fio frontal no topo
  panel(width - 0.06, plinth, depth - 0.06, 0, -height / 2 - plinth / 2, -0.02, woodEdge); // base
  group.add(shelf);

  // ---------- Sala ----------
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(60, 30), new THREE.MeshStandardMaterial({ map: tiled(wallTex(scene.wall, scene.dark), 120, 60), roughness: 0.95 }));
  wall.position.set(0, floorY + 15, wallZ);
  wall.receiveShadow = true;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 30), new THREE.MeshStandardMaterial({ map: tiled(floorTex(scene.floor, scene.dark), 40, 20), roughness: 0.8 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, floorY, wallZ + 15);
  floor.receiveShadow = true;
  const skirting = new THREE.Mesh(new THREE.BoxGeometry(60, 0.09, 0.02), retroMat(new THREE.Color(scene.wall).multiplyScalar(0.88).getStyle(), 0.6));
  skirting.position.set(0, floorY + 0.045, wallZ + 0.01); skirting.receiveShadow = true;
  group.add(wall, floor, skirting);
  // paredes laterais: fecham o quarto
  const roomHalf = width / 2 + 6.5; // longe o bastante para não aparecer no enquadramento normal
  for (const side of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({ map: tiled(wallTex(scene.wall, scene.dark), 60, 60), color: "#f2f2f2", roughness: 0.95 }));
    w.rotation.y = -side * Math.PI / 2;
    w.position.set(side * roomHalf, floorY + 15, wallZ + 15);
    w.receiveShadow = true;
    const sk = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.09, 30), skirting.material);
    sk.position.set(side * (roomHalf - 0.01), floorY + 0.045, wallZ + 15);
    group.add(w, sk);
  }
  // área ocupada pela estante (para os móveis não atravessarem)
  const shelfBox = new THREE.Box3(new THREE.Vector3(-width / 2, floorY, wallZ), new THREE.Vector3(width / 2, topY + 0.02, wallZ + depth + 0.03));

  // ---------- Posições dos CDs (com buracos, para separar por gênero) ----------
  const perRow = spine ? Math.floor((innerW - 0.06) / (D + 0.012)) : s.slots;
  const slotCount = perRow * s.rows;
  const pitch = spine ? D + 0.012 : cellW;
  const x0 = spine ? -innerW / 2 + 0.04 : -innerW / 2;
  const plankTop = (r: number) => height / 2 - T - r * (rowH + T) - rowH;
  const slotHome = (slot: number) => {
    const r = Math.floor(slot / perRow), k = slot % perRow;
    const home = spine
      ? new THREE.Vector3(x0 + (k + 0.5) * pitch, plankTop(r) + H / 2 + 0.002, depth / 2 - W / 2 - 0.015)
      : new THREE.Vector3(x0 + cellW * (k + 0.5), plankTop(r) + H / 2 + 0.01, -depth / 2 + 0.16);
    const rot = spine ? new THREE.Euler(0, Math.PI / 2, 0) : new THREE.Euler(-0.1, 0, 0);
    return { home, rot };
  };
  const slotAt = (p: THREE.Vector3) => {
    const r = THREE.MathUtils.clamp(Math.floor((height / 2 - T - p.y) / (rowH + T)), 0, s.rows - 1);
    const k = THREE.MathUtils.clamp(Math.floor((p.x - x0) / pitch), 0, perRow - 1);
    return r * perRow + k;
  };

  // quem já tem lugar fica; os outros ocupam o primeiro espaço livre
  const used = new Set<number>();
  for (const a of albums) {
    if (a.slot != null && a.slot < slotCount && !used.has(a.slot)) used.add(a.slot);
    else a.slot = undefined;
  }
  let free = 0;
  for (const a of albums) {
    if (a.slot != null) continue;
    while (used.has(free)) free++;
    if (free >= slotCount) break;
    a.slot = free; used.add(free);
  }

  const cds: CD[] = [];
  let hidden = 0;
  for (const album of albums) {
    if (album.slot == null || album.slot >= slotCount) { hidden++; continue; }
    const { root, lid, disc } = buildCase(album);
    const { home, rot } = slotHome(album.slot);
    root.position.copy(home);
    root.rotation.copy(rot);
    group.add(root);
    cds.push({ album, root, lid, disc, home, baseRot: rot, hover: 0, phase: Math.random() * 6 });
  }

  // ---------- TV, quadrinhos e decorações ----------
  const placeables: Placeable[] = [];
  const place = (id: string, obj: THREE.Object3D, kind: Placeable["kind"], def: [number, number, number]) => {
    obj.position.set(...(s.decorPos[id] ?? def));
    obj.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
    group.add(obj);
    placeables.push({ id, obj, kind });
  };

  const tv = buildTV(albums);
  place("tv", tv.obj, "floor", [-width / 2 - 1.15, floorY, wallZ + 0.36]);
  place("quadrinhos", buildFrames(albums), "wall", [width / 2 + 0.95, topY - 0.25, wallZ + 0.02]);

  const defaults: Record<string, [Placeable["kind"], [number, number, number]]> = {
    planta: ["top", [width / 2 - 0.25, topY, 0]],
    luminaria: ["top", [-width / 2 + 0.22, topY, 0]],
    gato: ["top", [0, topY, 0.02]],
    quadro: ["wall", [-width / 2 - 1.15, topY + 0.55, wallZ + 0.02]],
    neon: ["wall", [width / 2 + 0.95, topY + 0.65, wallZ + 0.03]],
    tapete: ["floor", [0, floorY + 0.003, wallZ + 1.6]],
    caixa_som: ["floor", [width / 2 + 0.5, floorY, wallZ + 0.3]],
    cacto: ["floor", [-width / 2 - 2.6, floorY, wallZ + 0.3]],
  };
  for (const id of s.placed) {
    const make = DECOR_BUILD[id], d = defaults[id];
    if (make && d) place(id, make(), d[0], d[1]);
  }

  return {
    group, cds, placeables, width, height, floorY, wallZ, topY, roomHalf, shelfBox,
    slotCount, slotHome, slotAt, hidden, tick: tv.tick, tv,
  };
}
