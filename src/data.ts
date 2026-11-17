import { invoke } from "@tauri-apps/api/core";

export type Track = { position: string; title: string; duration: string };
export type Img = { name: string; type: string; w: number; h: number };
export const ROLES = { front: "Capa", back: "Contracapa", disc: "Disco", tray: "Embaixo do disco", inner: "Dentro da tampa" } as const;
export type Role = keyof typeof ROLES;
export type Album = {
  id: number; title: string; artist: string; year: string; country: string;
  label: string; catno: string; barcode: string; genres?: string; tracks: Track[];
  front?: string | null; back?: string | null; disc?: string | null; tray?: string | null; inner?: string | null;
  images?: Img[]; uri?: string; slot?: number; added?: number; demo?: boolean;
  urls?: Partial<Record<Role, string>>; // carregado em tempo de execução
};
export type Candidate = {
  id: number; title: string; year: string; country: string;
  label: string; catno: string; format: string; thumb: string; images: number;
};

// ---------- Cenários (fundos prontos) ----------
export type Scene = { name: string; wall: string; floor: string; ambient: string; light: number; dark: boolean };
export const SCENES: Record<string, Scene> = {
  estudio: { name: "Estúdio branco", wall: "#f3f2ef", floor: "#e2ded6", ambient: "#ffffff", light: 1.0, dark: false },
  galeria: { name: "Galeria", wall: "#ffffff", floor: "#c9c9c7", ambient: "#f4f7ff", light: 1.1, dark: false },
  menta: { name: "Menta", wall: "#dcefe6", floor: "#c5ddd1", ambient: "#f0fff8", light: 1.0, dark: false },
  por_do_sol: { name: "Pôr do sol", wall: "#f5d9c6", floor: "#d9b59b", ambient: "#ffe6d2", light: 0.95, dark: false },
  lavanda: { name: "Lavanda", wall: "#e4def5", floor: "#cbc3e0", ambient: "#f3efff", light: 1.0, dark: false },
  quarto_2002: { name: "Quarto 2002", wall: "#1d2547", floor: "#141a33", ambient: "#8ea2ff", light: 0.8, dark: true },
  memoria: { name: "Memória", wall: "#07080f", floor: "#05060c", ambient: "#6f86ff", light: 0.7, dark: true },
};

// ---------- Acabamentos da prateleira ----------
export type Finish = { name: string; color: string; grain: boolean };
export const FINISHES: Record<string, Finish> = {
  carvalho: { name: "Carvalho claro", color: "#d8b88c", grain: true },
  pinho: { name: "Pinho", color: "#ead2a4", grain: true },
  nogueira: { name: "Nogueira", color: "#6e4629", grain: true },
  laca_branca: { name: "Laca branca", color: "#f7f6f2", grain: false },
  preto: { name: "Preto fosco", color: "#202022", grain: false },
  sage: { name: "Verde sálvia", color: "#a9b8a0", grain: false },
};

// ---------- Lojinha ----------
export type Decor = { id: string; name: string; price: number; spot: string };
export const DECOR: Decor[] = [
  { id: "planta", name: "Plantinha", price: 20, spot: "Em cima da estante" },
  { id: "quadro", name: "Quadro na parede", price: 30, spot: "Parede" },
  { id: "luminaria", name: "Luminária", price: 40, spot: "Em cima da estante" },
  { id: "tapete", name: "Tapete", price: 50, spot: "Chão" },
  { id: "caixa_som", name: "Caixa de som", price: 60, spot: "Chão" },
  { id: "neon", name: "Neon \"CD\"", price: 80, spot: "Parede" },
  { id: "gato", name: "Gatinho", price: 100, spot: "Em cima da estante" },
  { id: "cacto", name: "Cacto", price: 25, spot: "Chão" },
];
export const POINTS_START = 50, POINTS_PER_CD = 10;

// ---------- Configurações ----------
export type Settings = {
  scene: string; finish: string; customColor: string; slots: number; rows: number;
  pixel: number; crt: number; display: "capa" | "lombada"; token: string;
  owned: string[]; placed: string[];
  decorPos: Record<string, [number, number, number]>; // (antigo) posição absoluta
  /** posição relativa: s = lado da estante (-1 esq, 1 dir, 0 em frente/em cima), dx/dy/dz a partir da lateral, do chão e da parede */
  decorRel: Record<string, { s: number; dx: number; dy: number; dz: number }>;
  wall: string; sideWall: string; floor: string; // catálogo: "auto" = do cenário, sideWall "same" = igual ao fundo
};
const DEFAULTS: Settings = {
  scene: "estudio", finish: "carvalho", customColor: "", slots: 6, rows: 3,
  pixel: 2, crt: 0.35, display: "lombada", token: "", owned: [], placed: [], decorPos: {}, decorRel: {}, wall: "auto", sideWall: "same", floor: "auto",
};
export function loadSettings(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem("cd.settings") || "{}");
    if (saved.v !== 2) { saved.display = "lombada"; saved.v = 2; } // padrão novo: CDs em pé, lombada para fora
    return { ...DEFAULTS, ...saved };
  } catch { return { ...DEFAULTS }; }
}
export function saveSettings(s: Settings) {
  try { localStorage.setItem("cd.settings", JSON.stringify(s)); } catch { /* sem armazenamento */ }
  if ("__TAURI_INTERNALS__" in window) invoke("save_settings", { settings: s }).catch(() => {});
}
/** As configurações ficam num arquivo (sobrevivem à troca entre a versão de teste e a instalada). */
export async function syncSettings(current: Settings): Promise<Settings> {
  if (!("__TAURI_INTERNALS__" in window)) return current;
  const file = await invoke<Partial<Settings> | null>("load_settings").catch(() => null);
  if (!file) { saveSettings(current); return current; }
  const merged = { ...current, ...file };
  try { localStorage.setItem("cd.settings", JSON.stringify(merged)); } catch { /* ok */ }
  return merged;
}

// ---------- Backend Rust ----------
const isTauri = "__TAURI_INTERNALS__" in window;

const imgCache = new Map<string, Promise<string>>();
export function readImage(name: string) {
  if (!imgCache.has(name)) imgCache.set(name, invoke<string>("read_image", { name }));
  return imgCache.get(name)!;
}
export async function loadUrls(a: Album) {
  a.urls = {};
  for (const r of Object.keys(ROLES) as Role[]) {
    const n = a[r];
    if (n) a.urls[r] = await readImage(n).catch(() => undefined);
  }
}

/**
 * Coloca fotos do encarte dentro da caixa quando ainda não há escolha:
 * página quadrada → verso do encarte (dentro da tampa); foto "deitada" → embaixo do disco.
 */
export function autoAssign(a: Album) {
  const used = new Set([a.front, a.back, a.disc, a.tray, a.inner].filter(Boolean));
  const rest = (a.images ?? []).filter((im) => !used.has(im.name));
  const ratio = (im: Img) => im.w / Math.max(1, im.h);
  const take = (ok: (im: Img) => boolean) => {
    const i = rest.findIndex(ok);
    return i < 0 ? null : rest.splice(i, 1)[0].name;
  };
  if (!a.inner) a.inner = take((im) => ratio(im) > 0.85 && ratio(im) < 1.15) ?? take(() => true);
  if (!a.tray) a.tray = take((im) => ratio(im) >= 1.08 && ratio(im) < 1.45);
}

/** Páginas para o folheador: tudo menos o disco, com capa primeiro e contracapa no fim. */
export function bookletPages(a: Album) {
  const imgs = (a.images ?? []).map((i) => i.name).filter((n) => n !== a.disc);
  const order = (n: string) => (n === a.front ? -2 : n === a.inner ? -1 : n === a.back ? 2 : n === a.tray ? 1 : 0);
  return imgs.sort((x, y) => order(x) - order(y));
}

export async function loadCollection(): Promise<Album[]> {
  if (!isTauri) return [];
  const items = await invoke<Album[]>("load_collection");
  items.forEach(autoAssign);
  await Promise.all(items.map(loadUrls));
  return items;
}
export function saveCollection(items: Album[]) {
  if (!isTauri) return Promise.resolve();
  const clean = items.filter((a) => !a.demo).map(({ urls, ...rest }) => rest);
  return invoke("save_collection", { items: clean });
}
export const searchBarcode = (barcode: string, token: string) =>
  invoke<Candidate[]>("search_barcode", { barcode, token });

/** Disco escaneado: cantos com a mesma cor do fundo e o furo do meio também. */
async function looksLikeDisc(url: string) {
  const img = new Image();
  img.src = url;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(img, 0, 0, 64, 64);
  const px = (x: number, y: number) => g.getImageData(x, y, 1, 1).data;
  const pts = [px(1, 1), px(62, 1), px(1, 62), px(62, 62)];
  const center = px(32, 32);
  const dist = (a: Uint8ClampedArray, b: Uint8ClampedArray) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
  const cornersMatch = pts.every((p) => dist(p, pts[0]) < 45);
  return cornersMatch && dist(center, pts[0]) < 60;
}

export async function fetchRelease(id: number, token: string, barcode: string) {
  const a = await invoke<Album>("fetch_release", { id, token, barcode });
  // procura a foto do disco entre as imagens quadradas
  for (const im of a.images ?? []) {
    if (im.name === a.front || im.name === a.back) continue;
    const r = im.w / Math.max(1, im.h);
    if (r < 0.92 || r > 1.08) continue;
    if (await looksLikeDisc(await readImage(im.name)).catch(() => false)) { a.disc = im.name; break; }
  }
  autoAssign(a);
  await loadUrls(a);
  return a;
}
export const findPreview = (artist: string, title: string, album: string) =>
  isTauri ? invoke<string | null>("find_preview", { artist, title, album }) : Promise.resolve(null);
export const openUrl = (url: string) => (isTauri ? invoke("open_url", { url }) : (window.open(url), Promise.resolve()));

// ---------- Álbuns de exemplo (aparecem só com a coleção vazia) ----------
const demo = (id: number, title: string, artist: string, sides: string[][]): Album => ({
  id, title, artist, year: "2002", country: "Brasil", label: "Selo Exemplo", catno: `EX-${id}`,
  barcode: "", demo: true,
  tracks: sides.flatMap((s, si) => s.map((t, i) => ({ position: `${"AB"[si]}${i + 1}`, title: t, duration: `${3 + (i % 3)}:${String((i * 17) % 60).padStart(2, "0")}` }))),
});
export const DEMO: Album[] = [
  demo(-1, "Noites de Neon", "Vidro Azul", [["Abertura", "Luz Fria", "Avenida"], ["Madrugada", "Fim de Festa"]]),
  demo(-2, "Mar Aberto", "Os Ventos", [["Maré", "Farol", "Sal"], ["Areia", "Horizonte"]]),
  demo(-3, "Cidade 2002", "Pixel Club", [["Metrô", "Fliperama"], ["Antena", "Último Ônibus", "Neon"]]),
  demo(-4, "Lado B", "Fita Cassete", [["Rebobinar", "Play"], ["Pause", "Stop"]]),
  demo(-5, "Sol de Inverno", "Clara Lua", [["Geada", "Chá"], ["Cobertor", "Janela"]]),
  demo(-6, "Estática", "Canal 3", [["Sintonia", "Chuvisco"], ["Fora do Ar"]]),
  demo(-7, "Aurora", "Norte", [["Polar", "Gelo"], ["Céu Verde"]]),
];
