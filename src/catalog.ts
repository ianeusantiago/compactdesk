import * as THREE from "three";
import { floorTex, pixTex, wallTex } from "./retro";

/**
 * Catálogo de acabamentos da sala (estilo amostra de loja de papel de parede).
 * Cada item gera uma textura pixelada; `tile` é o tamanho de uma repetição na sala (em unidades da cena).
 */
export type Swatch = { name: string; tile: number; tex: (sceneColor: string, dark: boolean) => THREE.Texture };

type Draw = (g: CanvasRenderingContext2D, r: () => number) => void;
const fixed = (key: string, size: number, draw: Draw, levels = 12) => () => pixTex(key, size, size, draw, levels);

const rect = (g: CanvasRenderingContext2D, c: string, x: number, y: number, w: number, h: number) => { g.fillStyle = c; g.fillRect(x, y, w, h); };

// ------------------------------------------------------------------ paredes
export const WALLS: Record<string, Swatch> = {
  auto: { name: "Do cenário", tile: 0.5, tex: (c, d) => wallTex(c, d) },
  pintura: {
    name: "Pintura lisa", tile: 0.6,
    tex: (c) => pixTex(`paint-${c}`, 32, 32, (g, r) => { rect(g, c, 0, 0, 32, 32); for (let i = 0; i < 60; i++) rect(g, "rgba(0,0,0,.04)", r() * 32, r() * 32, 1, 1); }, 16),
  },
  listrado: {
    name: "Listrado creme", tile: 0.5,
    tex: fixed("w-stripe", 32, (g) => { rect(g, "#f2e8d2", 0, 0, 32, 32); for (let x = 0; x < 32; x += 8) { rect(g, "#a9bf9a", x, 0, 3, 32); rect(g, "#c9b98f", x + 4, 0, 1, 32); } }),
  },
  vichy: {
    name: "Xadrez vichy", tile: 0.35,
    tex: fixed("w-gingham", 16, (g) => { rect(g, "#f4f1ea", 0, 0, 16, 16); rect(g, "rgba(84,120,186,.45)", 0, 0, 8, 16); rect(g, "rgba(84,120,186,.45)", 0, 0, 16, 8); }),
  },
  floral: {
    name: "Floral rosado", tile: 0.45,
    tex: fixed("w-floral", 32, (g) => {
      rect(g, "#f6dfe0", 0, 0, 32, 32);
      for (const [x, y] of [[7, 7], [23, 23], [23, 7], [7, 23]] as const) {
        const alt = (x + y) % 32 === 14;
        rect(g, alt ? "#7aa36d" : "#d7728a", x - 1, y - 3, 3, 2); rect(g, alt ? "#7aa36d" : "#d7728a", x - 3, y - 1, 2, 3);
        rect(g, alt ? "#7aa36d" : "#d7728a", x + 2, y - 1, 2, 3); rect(g, alt ? "#7aa36d" : "#d7728a", x - 1, y + 2, 3, 2);
        rect(g, "#f3c34f", x, y, 1, 1);
      }
      rect(g, "#b8d0a9", 15, 15, 2, 2);
    }),
  },
  losangos: {
    name: "Losangos art déco", tile: 0.6,
    tex: fixed("w-deco", 32, (g) => {
      rect(g, "#1f3a3a", 0, 0, 32, 32);
      g.strokeStyle = "#c9a85a"; g.lineWidth = 1;
      g.beginPath(); g.moveTo(16, 0); g.lineTo(32, 16); g.lineTo(16, 32); g.lineTo(0, 16); g.closePath(); g.stroke();
      rect(g, "#c9a85a", 15, 15, 2, 2);
    }),
  },
  setentas: {
    name: "Geométrico anos 70", tile: 0.7,
    tex: fixed("w-70s", 32, (g) => {
      rect(g, "#f1dfb8", 0, 0, 32, 32);
      const arc = (cx: number, cy: number) => {
        for (const [rad, col] of [[15, "#c4622d"], [11, "#e29a3b"], [7, "#7a4a2a"]] as const) { g.fillStyle = col; g.beginPath(); g.arc(cx, cy, rad, 0, Math.PI * 2); g.fill(); }
        g.fillStyle = "#f1dfb8"; g.beginPath(); g.arc(cx, cy, 3, 0, Math.PI * 2); g.fill();
      };
      arc(0, 0); arc(32, 32); arc(32, 0); arc(0, 32);
    }, 10),
  },
  estrelas: {
    name: "Céu Y2K", tile: 0.6,
    tex: fixed("w-stars", 32, (g, r) => {
      rect(g, "#1b2150", 0, 0, 32, 32);
      for (let i = 0; i < 6; i++) { const x = Math.floor(r() * 30) + 1, y = Math.floor(r() * 30) + 1; rect(g, "#ffe78a", x, y - 1, 1, 3); rect(g, "#ffe78a", x - 1, y, 3, 1); }
      for (let i = 0; i < 10; i++) rect(g, "#8fa2ff", r() * 32, r() * 32, 1, 1);
    }),
  },
  tijolo: {
    name: "Tijolinho", tile: 0.8,
    tex: fixed("w-brick", 32, (g, r) => {
      rect(g, "#d7d0c4", 0, 0, 32, 32);
      for (let row = 0; row < 4; row++) for (let b = -1; b < 2; b++) {
        const x = b * 16 + (row % 2) * 8 + 1, y = row * 8 + 1;
        rect(g, ["#b5573b", "#a14a32", "#c0654a"][Math.floor(r() * 3)], x, y, 14, 6);
        rect(g, "rgba(0,0,0,.12)", x, y + 5, 14, 1);
      }
    }),
  },
  ripado: {
    name: "Madeira ripada", tile: 0.5,
    tex: fixed("w-slats", 32, (g, r) => {
      for (let x = 0; x < 32; x += 8) {
        rect(g, ["#a8784c", "#9c6e44", "#b0835a"][x / 8 % 3], x, 0, 7, 32);
        for (let k = 0; k < 4; k++) rect(g, "rgba(60,35,15,.25)", x + Math.floor(r() * 6), r() * 32, 1, 4 + r() * 8);
        rect(g, "#3b2516", x + 7, 0, 1, 32);
      }
    }),
  },
  lambri: {
    name: "Lambri escuro", tile: 0.5,
    tex: fixed("w-lambri", 32, (g) => { for (let x = 0; x < 32; x += 4) { rect(g, x % 8 ? "#4a3122" : "#553828", x, 0, 4, 32); rect(g, "#2a1a10", x + 3, 0, 1, 32); } }),
  },
  azulejo: {
    name: "Azulejo metrô", tile: 0.4,
    tex: fixed("w-subway", 32, (g) => {
      rect(g, "#c9cfd1", 0, 0, 32, 32);
      for (let row = 0; row < 4; row++) for (let b = -1; b < 2; b++) {
        const x = b * 16 + (row % 2) * 8 + 1, y = row * 8 + 1;
        rect(g, "#f4f6f5", x, y, 14, 6); rect(g, "#ffffff", x, y, 14, 1);
      }
    }),
  },
  azulejo_pt: {
    name: "Azulejo português", tile: 0.45,
    tex: fixed("w-azulejo", 32, (g) => {
      rect(g, "#f2f3f6", 0, 0, 32, 32);
      g.fillStyle = "#2c56a6";
      g.beginPath(); g.moveTo(16, 4); g.lineTo(28, 16); g.lineTo(16, 28); g.lineTo(4, 16); g.closePath(); g.fill();
      rect(g, "#f2f3f6", 13, 13, 6, 6); rect(g, "#2c56a6", 15, 15, 2, 2);
      for (const [x, y] of [[0, 0], [31, 0], [0, 31], [31, 31]]) rect(g, "#2c56a6", x - 2, y - 2, 4, 4);
      rect(g, "#c6cbd6", 0, 0, 32, 1); rect(g, "#c6cbd6", 0, 0, 1, 32);
    }),
  },
  concreto: {
    name: "Concreto", tile: 1.2,
    tex: fixed("w-concrete", 64, (g, r) => {
      rect(g, "#a9a8a3", 0, 0, 64, 64);
      for (let i = 0; i < 500; i++) rect(g, `rgba(${r() < 0.5 ? "0,0,0" : "255,255,255"},${r() * 0.1})`, r() * 64, r() * 64, 1 + r() * 2, 1);
      for (const [x, y] of [[10, 12], [44, 40], [30, 54]]) { rect(g, "#8f8e89", x, y, 2, 2); }
      rect(g, "#96958f", 0, 63, 64, 1); rect(g, "#96958f", 63, 0, 1, 64);
    }),
  },
};

// ------------------------------------------------------------------ chãos
export const FLOORS: Record<string, Swatch> = {
  auto: { name: "Do cenário", tile: 1.5, tex: (c, d) => floorTex(c, d) },
  tabua_clara: { name: "Tábua clara", tile: 1.5, tex: () => floorTex("#d8bd94", false) },
  tabua_escura: { name: "Tábua nogueira", tile: 1.5, tex: () => floorTex("#6d4a30", false) },
  espinha: {
    name: "Taco espinha de peixe", tile: 0.8,
    tex: fixed("f-herring", 32, (g) => {
      rect(g, "#5a3b22", 0, 0, 32, 32);
      const cols = ["#b98a58", "#a87a4b", "#c79a66"];
      for (let i = -4; i < 8; i++) for (let j = 0; j < 8; j++) {
        const x = i * 8 + j * 4, y = j * 4;
        g.fillStyle = cols[(i + j + 8) % 3];
        if ((i + j) % 2) g.fillRect(x, y, 7, 3); else g.fillRect(x + 4, y - 4, 3, 7);
      }
    }),
  },
  xadrez: {
    name: "Xadrez P&B", tile: 0.9,
    tex: fixed("f-checker", 16, (g) => { rect(g, "#f2efe8", 0, 0, 16, 16); rect(g, "#1d1d20", 0, 0, 8, 8); rect(g, "#1d1d20", 8, 8, 8, 8); }),
  },
  ceramica: {
    name: "Cerâmica terracota", tile: 0.9,
    tex: fixed("f-terracotta", 32, (g, r) => {
      rect(g, "#8a4b31", 0, 0, 32, 32);
      for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
        rect(g, ["#c06a45", "#b65f3c", "#c97650"][Math.floor(r() * 3)], x * 16 + 1, y * 16 + 1, 14, 14);
        rect(g, "rgba(255,255,255,.08)", x * 16 + 1, y * 16 + 1, 14, 1);
      }
    }),
  },
  ladrilho: {
    name: "Ladrilho hidráulico", tile: 0.9,
    tex: fixed("f-hydraulic", 32, (g) => {
      rect(g, "#ece4d2", 0, 0, 32, 32);
      g.fillStyle = "#3d6b5c"; g.beginPath(); g.arc(16, 16, 9, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#ece4d2"; g.beginPath(); g.arc(16, 16, 5, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#c7553b";
      for (const [x, y] of [[0, 0], [32, 0], [0, 32], [32, 32]]) { g.beginPath(); g.arc(x, y, 7, 0, Math.PI * 2); g.fill(); }
      rect(g, "#c7553b", 15, 15, 2, 2);
    }),
  },
  cimento: {
    name: "Cimento queimado", tile: 2,
    tex: fixed("f-cement", 64, (g, r) => {
      rect(g, "#9a9d9c", 0, 0, 64, 64);
      for (let i = 0; i < 700; i++) rect(g, `rgba(${r() < 0.5 ? "0,0,0" : "255,255,255"},${r() * 0.07})`, r() * 64, r() * 64, 2 + r() * 4, 1);
      rect(g, "#868988", 0, 63, 64, 1); rect(g, "#868988", 63, 0, 1, 64);
    }),
  },
  carpete: {
    name: "Carpete cinza", tile: 0.6,
    tex: fixed("f-carpet", 32, (g, r) => { rect(g, "#7c7f86", 0, 0, 32, 32); for (let i = 0; i < 400; i++) rect(g, `rgba(${r() < 0.5 ? "0,0,0" : "255,255,255"},${r() * 0.14})`, r() * 32, r() * 32, 1, 1); }),
  },
  carpete_vinho: {
    name: "Carpete vinho", tile: 0.6,
    tex: fixed("f-carpet-red", 32, (g, r) => { rect(g, "#6e2433", 0, 0, 32, 32); for (let i = 0; i < 400; i++) rect(g, `rgba(${r() < 0.5 ? "0,0,0" : "255,200,200"},${r() * 0.13})`, r() * 32, r() * 32, 1, 1); }),
  },
  linoleo: {
    name: "Linóleo retrô", tile: 0.5,
    tex: fixed("f-lino", 16, (g) => { rect(g, "#e9e2c8", 0, 0, 16, 16); rect(g, "#7fae9b", 0, 0, 8, 8); rect(g, "#7fae9b", 8, 8, 8, 8); rect(g, "rgba(0,0,0,.08)", 0, 7, 16, 1); }),
  },
  tatame: {
    name: "Tatame", tile: 1.4,
    tex: fixed("f-tatami", 32, (g) => {
      rect(g, "#c9c38d", 0, 0, 32, 32);
      for (let y = 0; y < 32; y += 2) rect(g, "rgba(90,85,40,.18)", 0, y, 32, 1);
      rect(g, "#3e4a35", 0, 0, 32, 2); rect(g, "#3e4a35", 0, 16, 16, 2); rect(g, "#3e4a35", 15, 0, 2, 32);
    }),
  },
};

/** Imagem da amostra (para os quadradinhos do catálogo). */
export function swatchURL(t: THREE.Texture) {
  return (t.image as HTMLCanvasElement).toDataURL();
}
