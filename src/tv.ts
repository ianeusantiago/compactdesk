import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { Album } from "./data";
import { grainTex, woodTex } from "./retro";

const std = (color: string, rough = 0.6, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: rough, map: grainTex(), ...extra }); // granulado retrô em tudo
const rbox = (w: number, h: number, d: number, r: number, mat: THREE.Material) => {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, r), mat);
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
const parseDur = (d: string) => {
  const [m, s] = d.split(":").map(Number);
  return Number.isFinite(m) && Number.isFinite(s) ? m * 60 + s : 210;
};
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** Estado vindo do player de prévias (quando a TV está em foco tocando). */
export type External = { album: Album; ti: number; el: number; dur: number; playing: boolean; status: string };

/** escolha da TV durante esta execução do app (zera ao fechar) */
let picked: { id: number; ti: number } | null = null;

export type TV = {
  obj: THREE.Group;
  /** ponto central da tela (coordenadas locais do obj) */
  screenCenter: THREE.Vector3;
  screen: THREE.Mesh;
  on: boolean;
  current: () => { album: Album; ti: number } | null;
  step: (dir: number) => void;
  stepAlbum: (dir: number) => void;
  /** botão de volume na frente da TV */
  knob: THREE.Object3D;
  setVolume: (v: number) => void;
  setExternal: (e: External | null) => void;
  tick: (t: number) => void;
};

export function buildTV(albums: Album[]): TV {
  const obj = new THREE.Group();
  const real = albums.filter((a) => !a.demo && a.tracks.length);
  const on = real.length > 0;

  // ---------- rack baixo ----------
  const wood = std("#ffffff", 0.6, { map: woodTex("#5a3f2c") });
  const top = rbox(1.6, 0.05, 0.7, 0.012, wood); top.position.y = 0.5;
  const low = rbox(1.5, 0.035, 0.64, 0.01, wood); low.position.y = 0.16;
  obj.add(top, low);
  for (const x of [-0.75, 0.75]) for (const z of [-0.3, 0.3]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.015, 0.5, 10), std("#222", 0.35, { metalness: 0.6 }));
    leg.position.set(x, 0.25, z); leg.castShadow = true; obj.add(leg);
  }
  const deck = rbox(0.64, 0.11, 0.42, 0.01, std("#b9bcc1", 0.35, { metalness: 0.6 })); deck.position.set(-0.32, 0.235, 0);
  const deckFace = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.07), std("#1d1f23", 0.3));
  deckFace.position.set(-0.32, 0.235, 0.211);
  obj.add(deck, deckFace);
  for (let i = 0; i < 4; i++) {
    const c = rbox(0.128, 0.012, 0.112, 0.002, std(["#e8e8e8", "#c23b2a", "#1e2b4a", "#e3c34f"][i], 0.4));
    c.position.set(0.4, 0.184 + i * 0.013, 0.02); c.rotation.y = (i - 1.5) * 0.12; obj.add(c);
  }

  // ---------- TV de tubo cinza, robusta ----------
  const tv = new THREE.Group();
  tv.position.set(0, 0.525, -0.02);
  const plastic = std("#6f7378", 0.55);
  const dark = std("#3b3e43", 0.5);
  const black = std("#111214", 0.4);
  const body = rbox(1.2, 0.98, 0.72, 0.07, plastic); body.position.set(0, 0.5, 0.02);
  const back = rbox(0.86, 0.74, 0.42, 0.1, plastic); back.position.set(0, 0.52, -0.5);
  const backCap = rbox(0.5, 0.42, 0.12, 0.05, dark); backCap.position.set(0, 0.54, -0.74);
  tv.add(body, back, backCap);
  // moldura frontal mais escura
  const face = rbox(1.14, 0.92, 0.04, 0.05, dark); face.position.set(0, 0.5, 0.37);
  tv.add(face);
  // recorte da tela
  const SW = 0.86, SH = 0.64, SY = 0.58;
  const rim = rbox(SW + 0.07, SH + 0.07, 0.03, 0.03, black); rim.position.set(0, SY, 0.385);
  tv.add(rim);
  // tela abaulada (plano curvado, a textura cobre a tela inteira)
  const geo = new THREE.PlaneGeometry(SW, SH, 20, 16);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) / (SW / 2), y = pos.getY(i) / (SH / 2);
    pos.setZ(i, 0.035 * (1 - x * x * 0.55) * (1 - y * y * 0.55));
  }
  geo.computeVertexNormals();
  const cv = document.createElement("canvas");
  cv.width = 320; cv.height = 240;
  const g = cv.getContext("2d")!;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  const screen = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    map: tex, emissiveMap: tex, emissive: "#ffffff", emissiveIntensity: on ? 1.05 : 0, roughness: 0.18, color: on ? "#ffffff" : "#24272b",
  }));
  screen.position.set(0, SY, 0.395);
  tv.add(screen);
  // faixa de controles: alto-falante, botões, led
  const grille = canvasTex(128, 32, (x) => {
    x.fillStyle = "#3b3e43"; x.fillRect(0, 0, 128, 32);
    x.fillStyle = "#1a1b1e"; for (let i = 4; i < 128; i += 6) x.fillRect(i, 6, 3, 20);
  });
  const spk = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.1), std("#ffffff", 0.7, { map: grille }));
  spk.position.set(-0.24, 0.13, 0.391); tv.add(spk);
  for (let i = 0; i < 2; i++) {
    const b = rbox(0.06, 0.035, 0.02, 0.008, i === 1 ? std("#9b2b22", 0.4) : std("#a9adb2", 0.4));
    b.position.set(0.12 + i * 0.085, 0.13, 0.392); tv.add(b);
  }
  // knob de volume (gira conforme o volume)
  const knob = new THREE.Group();
  knob.position.set(0.37, 0.13, 0.39);
  const kBody = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.035, 24), std("#2a2c30", 0.35));
  kBody.rotation.x = Math.PI / 2; kBody.position.z = 0.018;
  const kMark = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.03, 0.004), std("#e9e4d8", 0.4));
  kMark.position.set(0, 0.022, 0.037);
  const kRing = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.004, 6, 28), std("#a9adb2", 0.3, { metalness: 0.6 }));
  kRing.position.z = 0.004;
  knob.add(kBody, kMark, kRing);
  knob.userData.knob = true;
  kBody.userData.knob = true; kMark.userData.knob = true;
  tv.add(knob);
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.01, 8, 8), std(on ? "#5dff7a" : "#ff3b30", 0.3, { emissive: on ? "#5dff7a" : "#ff3b30", emissiveIntensity: 2.5 }));
  led.position.set(0.5, 0.13, 0.392); tv.add(led);
  // grade de ventilação no topo
  const vents = canvasTex(64, 64, (x) => { x.fillStyle = "#6f7378"; x.fillRect(0, 0, 64, 64); x.fillStyle = "#4b4f54"; for (let i = 4; i < 64; i += 6) x.fillRect(8, i, 48, 2); });
  const vent = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.4), std("#ffffff", 0.6, { map: vents }));
  vent.rotation.x = -Math.PI / 2; vent.position.set(0, 0.991, -0.1); tv.add(vent);
  // pés de borracha
  for (const x of [-0.5, 0.5]) for (const z of [-0.25, 0.28]) {
    const f = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.02, 12), black); f.position.set(x, 0.0, z); tv.add(f);
  }
  // antena
  const ant = new THREE.Mesh(new THREE.SphereGeometry(0.06, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), black);
  ant.position.set(0, 0.99, -0.15); tv.add(ant);
  for (const s of [-1, 1]) {
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.007, 0.6, 6), std("#c3c7cc", 0.2, { metalness: 0.9 }));
    rod.position.set(s * 0.15, 1.24, -0.15); rod.rotation.z = -s * 0.55; tv.add(rod);
  }
  const glow = new THREE.PointLight("#a9c4ff", on ? 1.4 : 0, 2.4);
  glow.position.set(0, SY, 0.9); tv.add(glow);
  obj.add(tv);

  // ---------- programação ----------
  const covers = new Map<number, HTMLImageElement>();
  for (const a of real) if (a.urls?.front) { const im = new Image(); im.src = a.urls.front; covers.set(a.id, im); }
  // a cada abertura do app: álbum e faixa sorteados (diferente do último álbum, se houver mais de um).
  // Enquanto o app está aberto, a escolha fica na memória para a TV não trocar quando a sala é reconstruída.
  let ai = 0, ti = 0, start = performance.now() / 1000;
  if (real.length) {
    const keep = picked ? real.findIndex((a) => a.id === picked!.id) : -1;
    if (keep >= 0) { ai = keep; ti = Math.min(picked!.ti, real[ai].tracks.length - 1); }
    else {
      let last = -1;
      try { last = Number(localStorage.getItem("cd.tvLast") ?? -1); } catch { /* ok */ }
      const pool = real.map((_, i) => i).filter((i) => real.length < 2 || real[i].id !== last);
      ai = pool[Math.floor(Math.random() * pool.length)];
      ti = Math.floor(Math.random() * real[ai].tracks.length);
      try { localStorage.setItem("cd.tvLast", String(real[ai].id)); } catch { /* ok */ }
    }
    picked = { id: real[ai].id, ti };
  }
  const remember = () => { if (real.length) picked = { id: real[ai].id, ti }; };
  let ext: External | null = null;
  let lastDraw = -1;
  let volume = 0.8, volShownAt = -10;

  const fit = (s: string, max: number) => { let o = s; while (g.measureText(o).width > max && o.length > 1) o = o.slice(0, -1); return o === s ? s : o.trimEnd() + "…"; };

  function draw(now: number) {
    let album: Album, idx: number, el: number, dur: number, status: string;
    if (ext) ({ album, ti: idx, el, dur, status } = ext);
    else {
      album = real[ai]; idx = ti;
      dur = parseDur(album.tracks[idx].duration); el = now - start; status = "▶";
      if (el > dur) { ti++; start = now; if (ti >= album.tracks.length) { ti = 0; ai = (ai + 1) % real.length; } return; }
    }
    const tr = album.tracks[idx];
    const im = covers.get(album.id);
    const ok = !!(im?.complete && im.naturalWidth);
    // fundo: a própria capa, ampliada e escurecida (preenche a tela toda)
    g.fillStyle = "#06080f"; g.fillRect(0, 0, 320, 240);
    if (ok) {
      g.globalAlpha = 0.35; g.filter = "blur(6px)";
      g.drawImage(im!, -40, -80, 400, 400);
      g.filter = "none"; g.globalAlpha = 1;
    }
    const shade = g.createLinearGradient(0, 0, 320, 0);
    shade.addColorStop(0, "rgba(4,6,14,.35)"); shade.addColorStop(1, "rgba(4,6,14,.85)");
    g.fillStyle = shade; g.fillRect(0, 0, 320, 240);
    // disco saindo da capa, girando
    const cx = 116, cy = 104, R = 62;
    g.save(); g.translate(cx, cy); g.rotate(now * (ext && !ext.playing ? 0 : 1.2));
    g.beginPath(); g.arc(0, 0, R, 0, 7); g.fillStyle = "#cdd5e4"; g.fill();
    const irid = g.createConicGradient(0, 0, 0);
    ["#f2f4f8", "#ffd6f0", "#cfe9ff", "#e9ffd6", "#f2f4f8"].forEach((c, i) => irid.addColorStop(i / 4, c));
    g.fillStyle = irid; g.globalAlpha = 0.9; g.fill(); g.globalAlpha = 1;
    g.fillStyle = "#06080f"; g.beginPath(); g.arc(0, 0, 8, 0, 7); g.fill();
    g.strokeStyle = "rgba(0,0,0,.25)"; g.beginPath(); g.arc(0, 0, 20, 0, 7); g.stroke();
    g.restore();
    // capa
    const S = 124;
    g.fillStyle = "rgba(0,0,0,.5)"; g.fillRect(22, 46, S, S);
    if (ok) g.drawImage(im!, 18, 42, S, S); else { g.fillStyle = "#3b4a6b"; g.fillRect(18, 42, S, S); }
    // textos à direita
    const X = 196, MW = 112;
    g.fillStyle = "#8fb0ff"; g.font = "600 10px 'Barlow Condensed', sans-serif";
    g.fillText(ext ? `PRÉVIA ${status}` : "TOCANDO AGORA", X, 54);
    g.fillStyle = "#fff"; g.font = "600 17px 'Barlow Condensed', sans-serif";
    g.fillText(fit(album.title, MW), X, 74);
    g.fillStyle = "#c3cff0"; g.font = "500 12px 'Barlow Condensed', sans-serif";
    g.fillText(fit(album.artist, MW), X, 90);
    g.fillStyle = "#fff"; g.font = "500 12px 'Barlow', sans-serif";
    g.fillText(fit(tr.title, MW), X, 118);
    g.fillStyle = "#8fb0ff"; g.font = "500 10px 'Barlow Condensed', sans-serif";
    g.fillText(`FAIXA ${idx + 1} DE ${album.tracks.length}`, X, 132);
    // progresso
    g.fillStyle = "rgba(255,255,255,.2)"; g.fillRect(X, 144, MW, 3);
    g.fillStyle = "#8fb0ff"; g.fillRect(X, 144, MW * Math.min(1, el / dur), 3);
    g.fillStyle = "#c3cff0"; g.font = "500 10px 'Barlow Condensed', sans-serif";
    g.fillText(fmt(el), X, 158); g.textAlign = "right"; g.fillText(fmt(dur), X + MW, 158); g.textAlign = "left";
    // equalizador ocupa a base
    const playing = !ext || ext.playing;
    for (let i = 0; i < 40; i++) {
      const h = playing ? 3 + Math.abs(Math.sin(now * (3 + (i % 5)) + i * 1.7)) * 26 : 3;
      g.fillStyle = i % 3 ? "rgba(90,130,255,.85)" : "rgba(160,190,255,.9)";
      g.fillRect(8 + i * 7.6, 232 - h, 5, h);
    }
    // indicador de volume (some depois de 1,5 s)
    if (now - volShownAt < 1.5) {
      g.fillStyle = "rgba(4,6,14,.75)"; g.fillRect(40, 196, 240, 30);
      g.fillStyle = "#7dff9a"; g.font = "600 12px 'Barlow Condensed', sans-serif";
      g.fillText("VOLUME", 50, 216);
      for (let i = 0; i < 20; i++) {
        g.fillStyle = i < Math.round(volume * 20) ? "#7dff9a" : "rgba(125,255,154,.2)";
        g.fillRect(104 + i * 8.4, 204, 6, 14);
      }
    }
    // varredura
    g.fillStyle = "rgba(0,0,0,.2)";
    for (let y = 0; y < 240; y += 2) g.fillRect(0, y, 320, 1);
    tex.needsUpdate = true;
  }

  if (!on) {
    const grd = g.createRadialGradient(120, 90, 10, 160, 120, 210);
    grd.addColorStop(0, "#41454a"); grd.addColorStop(1, "#141518");
    g.fillStyle = grd; g.fillRect(0, 0, 320, 240);
    tex.needsUpdate = true;
  }

  return {
    obj, screen, on,
    screenCenter: new THREE.Vector3(0, 0.525 + SY, -0.02 + 0.43),
    current: () => (on ? { album: real[ai], ti } : null),
    step(dir) {
      if (!on) return;
      ti += dir;
      if (ti >= real[ai].tracks.length) { ti = 0; ai = (ai + 1) % real.length; }
      if (ti < 0) { ai = (ai - 1 + real.length) % real.length; ti = real[ai].tracks.length - 1; }
      start = performance.now() / 1000;
      remember();
    },
    stepAlbum(dir) {
      if (!on) return;
      ai = (ai + dir + real.length) % real.length; ti = 0;
      remember();
      start = performance.now() / 1000;
    },
    knob,
    setVolume(v) {
      volume = v;
      volShownAt = performance.now() / 1000;
      knob.rotation.z = -(v - 0.5) * Math.PI * 1.5; // de -135° a +135°
      lastDraw = -1;
    },
    setExternal(e) { ext = e; },
    tick(t) {
      if (!on || t - lastDraw < 1 / 24) return;
      lastDraw = t;
      draw(performance.now() / 1000);
    },
  };
}
