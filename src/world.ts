import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { buildCase, W, H, D } from "./case";
import { FINISHES, SCENES, type Album, type Settings } from "./data";
import { DECOR_BUILD, buildFrames } from "./props";
import { buildTV, type TV } from "./tv";
import { grainTex, retroMat, woodTex } from "./retro";
import { FLOORS, WALLS } from "./catalog";

const tiled = (t: THREE.Texture, x: number, y: number) => { const c = t.clone(); c.repeat.set(x, y); c.needsUpdate = true; return c; };
/** Superfície da sala com a mesma cor da amostra do catálogo: parte vem da própria textura (emissiva),
 *  parte da luz — assim continua recebendo as sombras dos móveis sem escurecer. Longe/de lado, suaviza para não "tremer". */
const roomMat = (map: THREE.Texture, rough: number) => {
  map.minFilter = THREE.LinearMipmapLinearFilter; map.magFilter = THREE.LinearFilter; map.anisotropy = 8;
  return new THREE.MeshStandardMaterial({ map, color: "#8c8c8c", emissive: "#ffffff", emissiveMap: map, emissiveIntensity: 0.58, roughness: rough });
};
const flatMat = (map: THREE.Texture) => {
  map.minFilter = THREE.LinearMipmapLinearFilter; map.magFilter = THREE.LinearFilter; map.anisotropy = 8;
  return new THREE.MeshBasicMaterial({ map }); // paredes laterais: cor exata da amostra
};

export type CD = {
  album: Album; root: THREE.Group; lid: THREE.Group; disc: THREE.Object3D;
  home: THREE.Vector3; baseRot: THREE.Euler; hover: number; phase: number;
};
/** Objeto que dá para arrastar no modo Organizar: no chão, na parede ou em cima da estante. */
export type Rel = { s: number; dx: number; dy: number; dz: number };
/** altura fixa do chão da sala */
const FLOOR_Y = -1.6;
/** escala das estampas na sala: ripas, tijolos e listras no tamanho real (igual à amostra) */
const WALL_SCALE = 2, FLOOR_SCALE = 1.3;
export type Placeable = { id: string; obj: THREE.Object3D; kind: "floor" | "wall" | "top" };
export type World = {
  group: THREE.Group; cds: CD[]; placeables: Placeable[];
  width: number; height: number; floorY: number; wallZ: number; topY: number; roomHalf: number; shelfBox: THREE.Box3;
  centerY: number; toRel: (p: Placeable) => Rel;
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
  // o chão é fixo; a estante nasce nele e cresce para cima
  const floorY = FLOOR_Y;
  const cy = floorY + plinth + height / 2; // centro da estante
  const wallZ = -depth / 2 - 0.012;
  const topY = cy + height / 2;

  const shelf = new THREE.Group();
  const panel = (w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material = wood) => {
    const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(w, h, d) * 0.35), mat);
    m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; shelf.add(m);
  };
  panel(width - 0.01, height, 0.018, 0, 0, -depth / 2 + 0.009, woodEdge); // fundo
  panel(T, height, depth, -width / 2 + T / 2, 0, 0);
  panel(T, height, depth, width / 2 - T / 2, 0, 0);
  for (let r = 0; r <= s.rows; r++) panel(innerW + 0.002, T, depth - 0.004, 0, -height / 2 + T / 2 + r * (rowH + T), 0.002);
  panel(width, T * 0.7, 0.015, 0, height / 2 - T * 0.35, depth / 2 + 0.006, woodEdge); // fio frontal no topo
  panel(width - 0.06, plinth, depth - 0.06, 0, -height / 2 - plinth / 2, -0.02, woodEdge); // base
  shelf.position.y = cy;
  group.add(shelf);

  // ---------- Sala (acabamentos do catálogo) ----------
  const wallMap = (id: string, w: number, h: number) => {
    const sw = WALLS[id] ?? WALLS.auto;
    return tiled(sw.tex(scene.wall, scene.dark), w / (sw.tile * WALL_SCALE), h / (sw.tile * WALL_SCALE));
  };
  const floorMap = (w: number, h: number) => {
    const sw = FLOORS[s.floor] ?? FLOORS.auto;
    return tiled(sw.tex(scene.floor, scene.dark), w / (sw.tile * FLOOR_SCALE), h / (sw.tile * FLOOR_SCALE));
  };
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(60, 30), roomMat(wallMap(s.wall, 60, 30), 0.95));
  wall.position.set(0, floorY + 15, wallZ);
  wall.receiveShadow = true;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 30), roomMat(floorMap(60, 30), 0.8));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, floorY, wallZ + 15);
  floor.receiveShadow = true;
  const skirting = new THREE.Mesh(new THREE.BoxGeometry(60, 0.09, 0.02), retroMat(new THREE.Color(scene.wall).multiplyScalar(0.88).getStyle(), 0.6));
  skirting.position.set(0, floorY + 0.045, wallZ + 0.01); skirting.receiveShadow = true;
  group.add(wall, floor, skirting);
  // paredes laterais: fecham o quarto
  const roomHalf = width / 2 + 6.5; // longe o bastante para não aparecer no enquadramento normal
  for (const side of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), flatMat(wallMap(s.sideWall === "same" ? s.wall : s.sideWall, 30, 30)));
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
  const plankTop = (r: number) => cy + height / 2 - T - r * (rowH + T) - rowH;
  const slotHome = (slot: number) => {
    const r = Math.floor(slot / perRow), k = slot % perRow;
    const home = spine
      ? new THREE.Vector3(x0 + (k + 0.5) * pitch, plankTop(r) + H / 2 + 0.002, depth / 2 - W / 2 - 0.015)
      : new THREE.Vector3(x0 + cellW * (k + 0.5), plankTop(r) + H / 2 + 0.01, -depth / 2 + 0.16);
    const rot = spine ? new THREE.Euler(0, Math.PI / 2, 0) : new THREE.Euler(-0.1, 0, 0);
    return { home, rot };
  };
  const slotAt = (p: THREE.Vector3) => {
    const r = THREE.MathUtils.clamp(Math.floor((topY - T - p.y) / (rowH + T)), 0, s.rows - 1);
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
  const half = width / 2;
  // relativo → absoluto: fora da estante, preso à lateral mais próxima; em frente/em cima, proporcional à largura
  const toAbs = (kind: Placeable["kind"], r: Rel): [number, number, number] => {
    const x = r.s === 0 ? r.dx * half : r.s * half + r.dx;
    const y = kind === "top" ? topY : kind === "floor" ? floorY : floorY + r.dy; // chão: sempre no chão
    return [x, y, wallZ + r.dz];
  };
  const toRel = (p: Placeable): Rel => {
    const { x, y, z } = p.obj.position;
    const inside = p.kind === "top" || Math.abs(x) < half;
    const sd = inside ? 0 : Math.sign(x);
    return { s: sd, dx: inside ? x / half : x - sd * half, dy: y - floorY, dz: z - wallZ };
  };
  // posições antigas (absolutas, com o chão no meio da estante) viram relativas
  const oldFloor = -height / 2 - plinth;
  const legacy = (id: string): Rel | null => {
    const a = s.decorPos[id];
    if (!a) return null;
    const inside = Math.abs(a[0]) < half;
    const sd = inside ? 0 : Math.sign(a[0]);
    return { s: sd, dx: inside ? a[0] / half : a[0] - sd * half, dy: a[1] - oldFloor, dz: a[2] - wallZ };
  };
  const place = (id: string, obj: THREE.Object3D, kind: Placeable["kind"], def: [number, number, number]) => {
    const rel = s.decorRel[id] ?? legacy(id);
    obj.position.set(...(rel ? toAbs(kind, rel) : def));
    obj.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
    group.add(obj);
    placeables.push({ id, obj, kind });
  };

  // TV um pouco maior que o tamanho original (1,2×)
  const TV_SCALE = 1.2;
  const tv = buildTV(albums);
  tv.obj.scale.setScalar(TV_SCALE);
  place("tv", tv.obj, "floor", [-width / 2 - 1.55, floorY, wallZ + 0.36 * TV_SCALE]);

  // ---------- Tomada na parede (padrão brasileiro, 3 pinos) + cabo da TV ----------
  const outlet = new THREE.Group();
  const outletPos = new THREE.Vector3(tv.obj.position.x + 0.35, floorY + 0.38, wallZ);
  outlet.position.copy(outletPos);
  const white = retroMat("#f1efe9", 0.45);
  const plate = new THREE.Mesh(new RoundedBoxGeometry(0.13, 0.13, 0.014, 2, 0.006), white);
  plate.position.z = 0.007;
  const socket = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.012, 6), retroMat("#e2dfd8", 0.5));
  socket.rotation.x = Math.PI / 2; socket.position.z = 0.012;
  outlet.add(plate, socket);
  for (const [x, y] of [[-0.012, -0.004], [0.012, -0.004], [0, 0.014]]) { // furos
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.0045, 10), retroMat("#1b1b1d", 0.8));
    hole.position.set(x, y, 0.0185); outlet.add(hole);
  }
  // plugue encaixado
  const plugMat = retroMat("#2a2b2e", 0.5);
  const plug = new THREE.Mesh(new RoundedBoxGeometry(0.045, 0.06, 0.035, 2, 0.008), plugMat);
  plug.position.set(0, 0.0, 0.036);
  const boot = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.03, 10), plugMat);
  boot.position.set(0, -0.044, 0.036);
  outlet.add(plug, boot);
  outlet.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
  group.add(outlet);

  const cableMat = retroMat("#151517", 0.55);
  let cable: THREE.Mesh | null = null;
  const lastTV = new THREE.Vector3(Infinity, 0, 0);
  const updateCable = () => {
    if (lastTV.distanceToSquared(tv.obj.position) < 1e-6) return;
    lastTV.copy(tv.obj.position);
    // sai da traseira da TV, desce atrás do rack, corre rente à parede e sobe até o plugue
    const a = tv.obj.localToWorld(new THREE.Vector3(0.18, 0.95, -0.85));
    const floorZ = wallZ + 0.04, fy = floorY + 0.012;
    const ox = outletPos.x, plugBottom = outletPos.y - 0.06;
    const pts = [
      a,
      new THREE.Vector3(a.x + 0.04, a.y - 0.25, Math.max(floorZ + 0.05, a.z - 0.05)),
      new THREE.Vector3(a.x + 0.06, fy + 0.08, Math.max(floorZ, a.z - 0.12)),
      new THREE.Vector3(a.x + 0.1, fy, floorZ),
      new THREE.Vector3((a.x + ox) / 2, fy, floorZ),
      new THREE.Vector3(ox, fy + 0.02, floorZ - 0.005),
      new THREE.Vector3(ox, plugBottom - 0.12, outletPos.z + 0.036),
      new THREE.Vector3(ox, plugBottom, outletPos.z + 0.036),
    ];
    const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal", 0.3);
    if (cable) { cable.geometry.dispose(); group.remove(cable); }
    cable = new THREE.Mesh(new THREE.TubeGeometry(curve, 80, 0.007, 6), cableMat);
    cable.castShadow = true;
    group.add(cable);
  };
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
  const pb = new THREE.Box3();
  for (const p of placeables) {
    if (p.kind === "top" || p.id === "tapete") continue;
    for (let i = 0; i < 120; i++) {
      pb.setFromObject(p.obj);
      if (p.kind === "floor" && pb.min.z < wallZ) { p.obj.position.z += wallZ - pb.min.z + 0.01; continue; }
      if (!pb.intersectsBox(shelfBox)) break;
      p.obj.position.x += p.obj.position.x < 0 ? -0.05 : 0.05;
    }
  }
  // a tomada fica atrás da TV já na posição final
  outletPos.x = tv.obj.position.x + 0.35;
  outlet.position.copy(outletPos);
  updateCable();

  return {
    group, cds, placeables, width, height, floorY, wallZ, topY, roomHalf, shelfBox, centerY: cy, toRel,
    slotCount, slotHome, slotAt, hidden, tick: (t: number) => { updateCable(); tv.tick(t); }, tv,
  };
}
