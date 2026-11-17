import * as THREE from "three";

/**
 * Texturas "de console" (PS2 / Wii / N64): resolução baixa, pixel aparente,
 * paleta reduzida com pontilhado ordenado (Bayer 4×4) e detalhes pintados à mão.
 */

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16 - 0.5);
const cache = new Map<string, THREE.Texture>();

function rng(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
}

/** Desenha num canvas pequeno, reduz a paleta com dither e devolve textura com filtro "nearest". */
export function pixTex(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D, r: () => number) => void, levels = 10) {
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  draw(g, rng(1234 + key.length * 77));
  const img = g.getImageData(0, 0, w, h), d = img.data, step = 255 / (levels - 1);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, b = BAYER[(y % 4) * 4 + (x % 4)] * step;
    for (let k = 0; k < 3; k++) d[i + k] = Math.round((d[i + k] + b) / step) * step;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapLinearFilter;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  cache.set(key, t);
  return t;
}

const shade = (hex: string, f: number) => {
  const c = new THREE.Color(hex);
  c.r = Math.min(1, c.r * f); c.g = Math.min(1, c.g * f); c.b = Math.min(1, c.b * f);
  return c.getStyle();
};

/** Madeira: tábua com veios, nós e borda escura. */
export function woodTex(color: string) {
  return pixTex(`wood-${color}`, 64, 64, (g, r) => {
    g.fillStyle = color; g.fillRect(0, 0, 64, 64);
    for (let y = 0; y < 64; y++) {
      const v = Math.sin(y * 0.55 + Math.sin(y * 0.13) * 3) * 0.5 + 0.5;
      g.fillStyle = shade(color, 0.78 + v * 0.3); g.fillRect(0, y, 64, 1);
    }
    for (let i = 0; i < 14; i++) { g.fillStyle = shade(color, 0.6); g.fillRect(r() * 64, r() * 64, 4 + r() * 10, 1); }
    for (let i = 0; i < 2; i++) {
      const x = r() * 56 + 4, y = r() * 56 + 4;
      g.fillStyle = shade(color, 0.55); g.fillRect(x - 3, y - 1, 6, 3);
      g.fillStyle = shade(color, 0.4); g.fillRect(x - 1, y, 2, 1);
    }
  });
}

/** Piso de tábuas corridas. */
export function floorTex(color: string, dark: boolean) {
  if (dark) return pixTex(`tile-${color}`, 64, 64, (g) => { // piso quadriculado para cenários escuros
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
      g.fillStyle = shade(color, (x + y) % 2 ? 0.85 : 1.25); g.fillRect(x * 32, y * 32, 32, 32);
    }
    g.fillStyle = shade(color, 0.6); g.fillRect(0, 0, 64, 1); g.fillRect(0, 32, 64, 1); g.fillRect(0, 0, 1, 64); g.fillRect(32, 0, 1, 64);
  });
  return pixTex(`floor-${color}`, 64, 64, (g, r) => {
    for (let b = 0; b < 4; b++) {
      const y = b * 16, f = 0.88 + r() * 0.22;
      g.fillStyle = shade(color, f); g.fillRect(0, y, 64, 16);
      for (let k = 0; k < 6; k++) { g.fillStyle = shade(color, f * 0.86); g.fillRect(r() * 64, y + 2 + r() * 12, 6 + r() * 14, 1); }
      g.fillStyle = shade(color, 0.62); g.fillRect(0, y, 64, 1); // junta entre tábuas
      const cut = (b * 23 + 11) % 64;
      g.fillRect(cut, y, 1, 16);
    }
  });
}

/** Papel de parede com listras e losangos discretos. */
export function wallTex(color: string, dark: boolean) {
  return pixTex(`wall-${color}`, 32, 32, (g) => {
    g.fillStyle = color; g.fillRect(0, 0, 32, 32);
    g.fillStyle = shade(color, dark ? 1.25 : 0.95);
    for (let x = 0; x < 32; x += 8) g.fillRect(x, 0, 2, 32);
    g.fillStyle = shade(color, dark ? 1.35 : 0.92);
    for (const [x, y] of [[5, 6], [5, 22], [13, 14], [21, 6], [21, 22], [29, 14]]) {
      g.fillRect(x, y - 1, 1, 3); g.fillRect(x - 1, y, 3, 1);
    }
  }, 14);
}

/** Granulado leve para plástico, metal pintado, cerâmica etc. (multiplica a cor do material). */
export function grainTex(kind: "plastic" | "metal" | "clay" | "leaf" | "fabric" | "soil" = "plastic") {
  return pixTex(`grain-${kind}`, 32, 32, (g, r) => {
    g.fillStyle = "#ffffff"; g.fillRect(0, 0, 32, 32);
    if (kind === "metal") for (let y = 0; y < 32; y++) { g.fillStyle = `rgba(0,0,0,${r() * 0.18})`; g.fillRect(0, y, 32, 1); }
    else if (kind === "leaf") {
      const grd = g.createLinearGradient(0, 0, 0, 32); grd.addColorStop(0, "#ffffff"); grd.addColorStop(1, "#9a9a9a");
      g.fillStyle = grd; g.fillRect(0, 0, 32, 32);
      g.fillStyle = "rgba(255,255,255,.7)"; g.fillRect(15, 0, 2, 32);
    } else if (kind === "fabric") {
      for (let y = 0; y < 32; y += 2) for (let x = (y / 2) % 2; x < 32; x += 2) { g.fillStyle = "rgba(0,0,0,.12)"; g.fillRect(x, y, 1, 1); }
    } else {
      const n = kind === "soil" ? 260 : kind === "clay" ? 160 : 90, a = kind === "soil" ? 0.45 : 0.14;
      for (let i = 0; i < n; i++) { g.fillStyle = `rgba(0,0,0,${r() * a})`; g.fillRect(r() * 32, r() * 32, 1, 1); }
      for (let i = 0; i < n / 3; i++) { g.fillStyle = `rgba(255,255,255,.08)`; g.fillRect(r() * 32, r() * 32, 1, 1); }
    }
  }, 12);
}

/** Material padrão "retrô": cor + granulado pixelado. */
export function retroMat(color: string, rough = 0.7, kind: Parameters<typeof grainTex>[0] = "plastic", extra: THREE.MeshStandardMaterialParameters = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, map: grainTex(kind), ...extra });
}
