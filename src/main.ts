import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import "@fontsource/barlow-condensed/500.css";
import "@fontsource/barlow-condensed/600.css";
import "@fontsource/barlow/400.css";
import "@fontsource/barlow/500.css";
import {
  DECOR, DEMO, FINISHES, POINTS_PER_CD, POINTS_START, ROLES, SCENES,
  bookletPages, fetchRelease, findPreview, loadCollection, loadSettings, loadUrls, syncSettings, openUrl, readImage, saveCollection, saveSettings, searchBarcode,
  type Album, type Role, type Settings,
} from "./data";
import { buildCase } from "./case";
import { FLOORS, WALLS, swatchURL } from "./catalog";
import { grainTex, woodTex } from "./retro";
import { buildWorld, type CD, type Placeable, type World } from "./world";
import { D, H, W } from "./case";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

let settings: Settings = loadSettings();
let collection: Album[] = [];
let world: World | null = null;

// ---------- Renderer em baixa resolução + filtro de TV ----------
const canvas = $<HTMLCanvasElement>("scene");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const lowRes = new THREE.WebGLRenderTarget(1, 1, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, samples: 0 });

const scene = new THREE.Scene();
// reflexos de estúdio: dão vida ao acrílico e ao disco metálico
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;
const camera = new THREE.PerspectiveCamera(36, 1, 0.05, 80);

const crt = new THREE.ShaderMaterial({
  uniforms: { tex: { value: lowRes.texture }, time: { value: 0 }, res: { value: new THREE.Vector2() }, amt: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`,
  fragmentShader: `
    uniform sampler2D tex; uniform float time, amt; uniform vec2 res; varying vec2 vUv;
    float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec2 uv = vUv * 2. - 1.;
      uv *= 1. + amt * pow(abs(uv.yx) / vec2(5.5, 4.5), vec2(2.));
      uv = uv * .5 + .5;
      if (uv.x < 0. || uv.x > 1. || uv.y < 0. || uv.y > 1.) { gl_FragColor = vec4(0.,0.,0.,1.); return; }
      float ab = .0016 * amt;
      vec3 col = vec3(texture2D(tex, uv + vec2(ab,0.)).r, texture2D(tex, uv).g, texture2D(tex, uv - vec2(ab,0.)).b);
      vec3 fx = col;
      fx *= .86 + .14 * sin(uv.y * res.y * 3.14159);
      fx += (rnd(uv * res + time) - .5) * .04;
      fx *= 1. - .3 * pow(length(vUv - .5) * 1.25, 2.5);
      gl_FragColor = vec4(mix(col, fx, amt), 1.);
    }`,
});
const postScene = new THREE.Scene();
const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), crt));

// ---------- Luzes ----------
const hemi = new THREE.HemisphereLight("#ffffff", "#d8d2c8", 1.1);
const key = new THREE.DirectionalLight("#fffaf2", 2.2);
key.position.set(3, 6, 6);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
Object.assign(key.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 20 });
key.shadow.bias = -0.0008;
key.shadow.radius = 4;
scene.add(hemi, key);

// ---------- Câmera: zoom e pan ----------
const view = { x: 0, y: 0, dist: 7, tx: 0, ty: 0, tdist: 7 };
const FOCUS_DIST = 2.5; // distância do CD em foco até a câmera
let fitDist = 7;
const MIN_DIST = 1.05; // perto o bastante para ler as lombadas
function frameShelf() {
  if (!world) return;
  const tan = Math.tan(THREE.MathUtils.degToRad(18));
  fitDist = Math.max((world.height + 0.8) / (2 * tan), (world.width + 7) / (2 * tan * camera.aspect));
  view.tdist = fitDist;
  view.tx = 0; view.ty = world.centerY;
}
/** Não deixa a vista fugir da estante. */
function clampView() {
  if (!world) return;
  view.tx = THREE.MathUtils.clamp(view.tx, -world.width / 2 - 3, world.width / 2 + 3);
  view.ty = THREE.MathUtils.clamp(view.ty, world.floorY + 0.3, world.topY + 0.6);
}

// ---------- Mundo ----------
function shelfAlbums() {
  return collection.length ? collection : DEMO;
}
function rebuild(reframe = false) {
  if (focused) release();
  exitTV();
  if (world) {
    scene.remove(world.group);
    world.group.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
    });
  }
  world = buildWorld(settings, shelfAlbums());
  scene.add(world.group);
  const sc = SCENES[settings.scene] ?? SCENES.estudio;
  scene.background = new THREE.Color(sc.wall);
  scene.fog = new THREE.Fog(sc.wall, 14, 40);
  hemi.color.set(sc.ambient);
  hemi.groundColor.set(sc.floor);
  hemi.intensity = sc.dark ? 0.6 : 1.1;
  key.intensity = 2.2 * sc.light;
  document.body.classList.toggle("dark-ui", sc.dark);
  document.documentElement.style.setProperty("--bg", sc.wall);
  if (reframe) frameShelf();
  else { // mantém a câmera onde estava (só recalcula o limite de zoom)
    const { tx, ty, tdist } = view;
    frameShelf();
    Object.assign(view, { tx, ty, tdist: THREE.MathUtils.clamp(tdist, MIN_DIST, fitDist * 1.25) });
    clampView();
  }
  updatePoints();
}

// ---------- Pontos / lojinha ----------
const realCount = () => collection.filter((a) => !a.demo).length;
const spent = () => DECOR.filter((d) => settings.owned.includes(d.id)).reduce((s, d) => s + d.price, 0);
const points = () => POINTS_START + realCount() * POINTS_PER_CD - spent();
function updatePoints() {
  const n = realCount();
  $("points").innerHTML = `<span>${n} ${n === 1 ? "disco" : "discos"}</span><i></i><span>${points()} pts</span>`;
}

function toast(msg: string) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout((t as any)._h);
  (t as any)._h = setTimeout(() => t.classList.remove("show"), 2600);
}

function setSetting<K extends keyof Settings>(k: K, v: Settings[K], rebuildWorld = true) {
  settings[k] = v;
  saveSettings(settings);
  if (rebuildWorld) rebuild();
  resize();
}

// ---------- Painéis ----------
const drawer = $("drawer");
let drawerMode: "" | "custom" | "shop" = "";

function openDrawer(mode: "custom" | "shop") {
  if (drawerMode === mode) { closeDrawer(); return; }
  closeInfo();
  drawerMode = mode;
  drawer.hidden = false;
  drawer.classList.toggle("catalog", mode === "custom");
  mode === "custom" ? renderCustom() : renderShop();
}
function closeDrawer() { drawerMode = ""; drawer.hidden = true; }

type CatTab = "cenario" | "fundo" | "laterais" | "chao" | "estante" | "ajustes";
let catTab: CatTab = "cenario";
const TABS: [CatTab, string][] = [["cenario", "Cenário"], ["fundo", "Parede do fundo"], ["laterais", "Paredes laterais"], ["chao", "Chão"], ["estante", "Estante"], ["ajustes", "Ajustes"]];

/** Amostra quadrada (como as de loja de papel de parede): a textura repetida, com o nome embaixo. */
function tile(attr: string, url: string, name: string, on: boolean, size = 26) {
  return `<button class="sample ${on ? "on" : ""}" ${attr}>
    <span class="chip" style="background-image:url(${url});background-size:${size}px"></span>
    <span class="nm">${esc(name)}</span></button>`;
}
function sceneTile(k: string, on: boolean) {
  const sc = SCENES[k];
  const w = swatchURL(WALLS.auto.tex(sc.wall, sc.dark)), f = swatchURL(FLOORS.auto.tex(sc.floor, sc.dark));
  return `<button class="sample ${on ? "on" : ""}" data-scene="${k}">
    <span class="chip room"><i style="background-image:url(${w})"></i><i style="background-image:url(${f})"></i></span>
    <span class="nm">${esc(sc.name)}</span></button>`;
}

function renderCustom() {
  const s = settings;
  const sc = SCENES[s.scene] ?? SCENES.estudio;
  let body = "";
  if (catTab === "cenario") {
    body = `<p class="note">O cenário define a luz e o clima. Ele volta a parede e o chão para o padrão dele.</p>
      <div class="samples">${Object.keys(SCENES).map((k) => sceneTile(k, s.scene === k)).join("")}</div>`;
  } else if (catTab === "fundo" || catTab === "laterais") {
    const key = catTab === "fundo" ? "wall" : "sideWall";
    const cur = s[key];
    const same = catTab === "laterais" ? tile(`data-wall="same" data-key="sideWall"`, swatchURL((WALLS[s.wall] ?? WALLS.auto).tex(sc.wall, sc.dark)), "Igual ao fundo", cur === "same") : "";
    body = `<div class="samples">${same}${Object.entries(WALLS).map(([id, w]) =>
      tile(`data-wall="${id}" data-key="${key}"`, swatchURL(w.tex(sc.wall, sc.dark)), w.name, cur === id)).join("")}</div>`;
  } else if (catTab === "chao") {
    body = `<div class="samples">${Object.entries(FLOORS).map(([id, f]) =>
      tile(`data-floor="${id}"`, swatchURL(f.tex(sc.floor, sc.dark)), f.name, s.floor === id, 40)).join("")}</div>`;
  } else if (catTab === "estante") {
    body = `<div class="cols">
      <div class="samples">${Object.entries(FINISHES).map(([k, v]) =>
        tile(`data-finish="${k}"`, v.grain ? swatchURL(woodTex(v.color)) : swatchURL(grainTex("plastic")), v.name, !s.customColor && s.finish === k, 40)
          .replace('class="chip"', `class="chip" data-tint="${v.grain ? "" : v.color}"`)).join("")}</div>
      <div class="opts">
        <label class="field">Cor personalizada</label>
        <div class="row"><input type="color" id="cc" value="${s.customColor || FINISHES[s.finish]?.color || "#d8b88c"}">
          <button data-clearcolor ${s.customColor ? "" : "disabled"}>Usar madeira</button></div>
        <label class="field">Largura <span>${s.slots}</span></label>
        <input type="range" min="3" max="10" value="${s.slots}" data-num="slots">
        <label class="field">Prateleiras <span>${s.rows}</span></label>
        <input type="range" min="1" max="5" value="${s.rows}" data-num="rows">
        <label class="field">Mostrar os CDs</label>
        <div class="seg"><button class="${s.display === "capa" ? "on" : ""}" data-display="capa">De frente</button>
          <button class="${s.display === "lombada" ? "on" : ""}" data-display="lombada">Lombada</button></div>
      </div></div>`;
  } else {
    body = `<div class="cols"><div class="opts">
        <label class="field">Pixelado <span>${s.pixel}×</span></label>
        <input type="range" min="1" max="5" value="${s.pixel}" data-num="pixel" data-norebuild>
        <label class="field">Filtro de TV <span>${Math.round(s.crt * 100)}%</span></label>
        <input type="range" min="0" max="100" value="${Math.round(s.crt * 100)}" data-crt>
      </div><div class="opts">
        <label class="field">Token do Discogs</label>
        <input type="password" id="token" value="${esc(s.token)}" placeholder="cole aqui seu token">
        <p class="note">Gere de graça em Discogs → Settings → Developers. Fica salvo só neste computador. <a href="#" data-dev>Abrir página</a></p>
      </div></div>`;
  }
  drawer.innerHTML = `
    <button class="close" data-x>✕</button>
    <div class="tabs">${TABS.map(([k, n]) => `<button class="${catTab === k ? "on" : ""}" data-tab="${k}">${n}</button>`).join("")}</div>
    <div class="catbody">${body}</div>`;
  // acabamentos lisos: pinta o quadradinho com a cor
  drawer.querySelectorAll<HTMLElement>("[data-tint]").forEach((el) => { if (el.dataset.tint) el.style.backgroundColor = el.dataset.tint, el.style.backgroundBlendMode = "multiply"; });
}

function renderShop() {
  const pts = points();
  drawer.innerHTML = `
    <button class="close" data-x>✕</button>
    <h2>Lojinha</h2>
    <div class="wallet"><span>Seus pontos</span><b>${pts}</b></div>
    <p class="note">Cada CD cadastrado vale ${POINTS_PER_CD} pontos.</p>
    ${DECOR.map((d) => {
      const owned = settings.owned.includes(d.id), placed = settings.placed.includes(d.id);
      const btn = owned
        ? `<button data-toggle="${d.id}">${placed ? "Guardar" : "Colocar"}</button>`
        : `<button class="primary" data-buy="${d.id}" ${pts < d.price ? "disabled" : ""}>${d.price} pts</button>`;
      return `<div class="item"><div>${d.name}<small>${d.spot}${owned ? " · seu" : ""}</small></div>${btn}</div>`;
    }).join("")}`;
}

drawer.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>("button,a");
  if (!b) return;
  const d = b.dataset;
  if (d.x !== undefined) return closeDrawer();
  if (d.dev !== undefined) { e.preventDefault(); openUrl("https://www.discogs.com/settings/developers"); return; }
  if (d.tab) catTab = d.tab as CatTab;
  if (d.scene) { Object.assign(settings, { wall: "auto", sideWall: "same", floor: "auto" }); setSetting("scene", d.scene); }
  if (d.wall) setSetting(d.key as "wall" | "sideWall", d.wall);
  if (d.floor) setSetting("floor", d.floor);
  if (d.finish) { settings.customColor = ""; setSetting("finish", d.finish); }
  if (d.clearcolor !== undefined) setSetting("customColor", "");
  if (d.display) setSetting("display", d.display as Settings["display"]);
  if (d.buy) {
    const item = DECOR.find((x) => x.id === d.buy)!;
    if (points() < item.price) return;
    settings.owned.push(item.id);
    settings.placed.push(item.id);
    setSetting("owned", settings.owned);
    toast(`${item.name} na sua sala!`);
  }
  if (d.toggle) {
    const p = settings.placed;
    setSetting("placed", p.includes(d.toggle) ? p.filter((x) => x !== d.toggle) : [...p, d.toggle]);
  }
  drawerMode === "custom" ? renderCustom() : renderShop();
});
drawer.addEventListener("input", (e) => {
  const el = e.target as HTMLInputElement;
  if (el.id === "cc") { setSetting("customColor", el.value); return; }
  if (el.id === "token") { setSetting("token", el.value.trim(), false); return; }
  if (el.dataset.crt !== undefined) { setSetting("crt", Number(el.value) / 100, false); }
  else if (el.dataset.num) setSetting(el.dataset.num as "slots", Number(el.value), el.dataset.norebuild === undefined);
  const span = el.previousElementSibling?.querySelector("span");
  if (span) span.textContent = el.dataset.crt !== undefined ? `${el.value}%` : el.dataset.num === "pixel" ? `${el.value}×` : el.value;
});

// ---------- Informações do CD ----------
const info = $("info");
function groupTracks(a: Album) {
  const groups = new Map<string, Album["tracks"]>();
  for (const t of a.tracks) {
    const side = /^([A-Za-z]+)\d/.exec(t.position)?.[1];
    const disc = /^(\d+)[-.]\d/.exec(t.position)?.[1];
    const key = side ? `Lado ${side.toUpperCase()}` : disc ? `Disco ${disc}` : "Faixas";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }
  return groups;
}
function totalTime(a: Album) {
  const sec = a.tracks.reduce((s, t) => {
    const [m, x] = t.duration.split(":").map(Number);
    return s + (Number.isFinite(m) && Number.isFinite(x) ? m * 60 + x : 0);
  }, 0);
  return sec ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}` : "";
}
function showInfo(a: Album) {
  closeDrawer();
  info.hidden = false;
  const total = totalTime(a);
  info.innerHTML = `
    <button class="close" data-x title="Devolver à prateleira">✕</button>
    <div class="cat">${esc([a.label, a.catno].filter(Boolean).join(" · ") || (a.demo ? "CD de exemplo" : ""))}</div>
    <div class="artist">${esc(a.artist)}</div>
    <div class="title">${esc(a.title)}</div>
    <div class="actions">
      <button class="spotify" data-spotify><span class="dot"></span>Ouvir no Spotify</button>
      <button data-open>${lidTarget > 0.5 ? "Fechar" : "Abrir"} estojo</button>
      ${a.images && a.images.length > 1 ? `<button data-booklet>Folhear encarte</button>` : ""}
      ${a.uri ? `<button class="link" data-discogs>Discogs ↗</button>` : ""}
    </div>
    ${[...groupTracks(a)].map(([k, ts]) => `<h3>${esc(k)}</h3><ol class="tracks">${ts.map((t) =>
      `<li><span class="pos">${esc(t.position)}</span><span class="t">${esc(t.title)}</span><span class="d">${esc(t.duration)}</span></li>`).join("")}</ol>`).join("")}
    ${total ? `<div class="total">Tempo total <b>${total}</b></div>` : ""}
    ${a.demo ? "" : `
      <h3>Encartes <small>${a.images?.length ?? 0} fotos</small></h3>
      <div class="gallery" id="gal">${a.images?.length ? "" : `<p class="note">Este CD foi salvo antes das fotos completas. Use "Atualizar do Discogs".</p>`}</div>`}
    <div class="credits">
      ${[a.year && `℗ ${a.year} ${a.label}`, a.country && `Feito em ${a.country}`, a.barcode && `Código de barras ${a.barcode}`].filter(Boolean).map((x) => `<span>${esc(String(x))}</span>`).join("")}
    </div>
    <div class="actions foot">
      <button data-x>← Devolver à prateleira</button>
      ${a.demo ? "" : `<button class="link" data-refresh>Atualizar do Discogs</button><button class="link danger" data-remove>Remover</button>`}
    </div>`;
  fillGallery(a);
}

async function fillGallery(a: Album) {
  const gal = document.getElementById("gal");
  if (!gal || !a.images?.length) return;
  gal.innerHTML = a.images.map((im) => {
    const role = (Object.keys(ROLES) as Role[]).find((r) => a[r] === im.name);
    return `<button class="thumb" data-img="${esc(im.name)}"><img alt="">${role ? `<em>${ROLES[role]}</em>` : ""}</button>`;
  }).join("");
  const imgs = gal.querySelectorAll<HTMLButtonElement>(".thumb");
  for (const [i, im] of a.images.entries()) {
    readImage(im.name).then((src) => { const el = imgs[i]?.querySelector("img"); if (el) el.src = src; }).catch(() => {});
  }
}

// ---------- Visualizar encarte e escolher onde ele vai na caixa ----------
const lightbox = $("lightbox");
// ---------- Folheador: todas as páginas e pôsteres do encarte ----------
let book: { pages: string[]; i: number } = { pages: [], i: 0 };
function openBooklet(a: Album) {
  const pages = bookletPages(a);
  if (!pages.length) { toast("Este CD não tem fotos do encarte."); return; }
  book = { pages, i: Math.max(0, pages.indexOf(a.inner ?? "")) };
  lightbox.dataset.mode = "book";
  lightbox.hidden = false;
  lightbox.innerHTML = `
    <div class="lb-frame book">
      <button class="nav prev" data-turn="-1">‹</button>
      <img id="lb-img" alt="">
      <button class="nav next" data-turn="1">›</button>
      <div class="lb-bar"><span id="pg"></span><button data-close>Fechar</button></div>
    </div>`;
  lightbox.onclick = (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("button");
    if (e.target === lightbox || b?.dataset.close !== undefined) { lightbox.hidden = true; return; }
    if (b?.dataset.turn) turnPage(Number(b.dataset.turn));
  };
  turnPage(0);
}
async function turnPage(step: number) {
  book.i = (book.i + step + book.pages.length) % book.pages.length;
  const img = $("lb-img") as HTMLImageElement;
  img.classList.remove("flip"); void img.offsetWidth; img.classList.add("flip");
  img.src = await readImage(book.pages[book.i]);
  $("pg").textContent = `Página ${book.i + 1} de ${book.pages.length}`;
}

async function openLightbox(a: Album, name: string) {
  lightbox.dataset.mode = "photo";
  lightbox.hidden = false;
  lightbox.innerHTML = `
    <div class="lb-frame">
      <img id="lb-img" alt="">
      <div class="lb-bar">
        <span>Usar esta foto como</span>
        ${(Object.keys(ROLES) as Role[]).map((r) =>
          `<button data-role="${r}" class="${a[r] === name ? "on" : ""}">${ROLES[r]}</button>`).join("")}
        <button data-close>Fechar</button>
      </div>
    </div>`;
  ($("lb-img") as HTMLImageElement).src = await readImage(name);
  lightbox.onclick = async (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("button");
    if (e.target === lightbox || b?.dataset.close !== undefined) { lightbox.hidden = true; return; }
    const r = b?.dataset.role as Role | undefined;
    if (!r) return;
    // a mesma foto não pode ocupar dois lugares
    for (const k of Object.keys(ROLES) as Role[]) if (a[k] === name) a[k] = null;
    a[r] = name;
    await loadUrls(a);
    await saveCollection(collection);
    replaceCase(a);
    openLightbox(a, name);
    showInfo(a);
  };
}

/** Recria só a caixa do CD em foco (sem reconstruir a sala inteira). */
function replaceCase(a: Album) {
  const cd = world?.cds.find((c) => c.album === a);
  if (!cd || !world) return;
  const { root, lid, disc } = buildCase(a);
  root.position.copy(cd.root.position);
  root.quaternion.copy(cd.root.quaternion);
  root.scale.copy(cd.root.scale);
  lid.rotation.y = cd.lid.rotation.y;
  world.group.remove(cd.root);
  world.group.add(root);
  Object.assign(cd, { root, lid, disc });
}

async function refreshAlbum(a: Album, btn: HTMLElement) {
  if (!settings.token) { toast("Configure o token do Discogs em Personalizar."); return; }
  btn.textContent = "Baixando fotos…";
  btn.setAttribute("disabled", "");
  try {
    const fresh = await fetchRelease(a.id, settings.token, a.barcode);
    Object.assign(a, fresh, { added: a.added ?? fresh.added });
    await saveCollection(collection);
    replaceCase(a);
    showInfo(a);
    toast(`${a.images?.length ?? 0} fotos baixadas.`);
  } catch (err) {
    toast(String(err));
    btn.textContent = "↻ Atualizar do Discogs";
    btn.removeAttribute("disabled");
  }
}
function closeInfo() { info.hidden = true; }

info.addEventListener("click", async (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>("button");
  if (!b || !focused) return;
  const a = focused.album, d = b.dataset;
  if (d.x !== undefined) release();
  if (d.spotify !== undefined) openUrl(`https://open.spotify.com/search/${encodeURIComponent(`${a.artist} ${a.title}`)}`);
  if (d.discogs !== undefined && a.uri) openUrl(a.uri);
  if (d.img) openLightbox(a, d.img);
  if (d.refresh !== undefined) refreshAlbum(a, b);
  if (d.booklet !== undefined) openBooklet(a);
  if (d.open !== undefined) { lidTarget = lidTarget > 0.5 ? 0 : 1; b.textContent = `${lidTarget > 0.5 ? "Fechar" : "Abrir"} estojo`; }
  if (d.remove !== undefined && confirm(`Remover "${a.title}" da coleção?`)) {
    collection = collection.filter((x) => x.id !== a.id);
    await saveCollection(collection);
    release();
    rebuild();
    toast("Removido.");
  }
});

// ---------- Adicionar CD ----------
const modal = $("modal"), sheet = $("add");
function openAdd() {
  closeDrawer();
  modal.hidden = false;
  const needsToken = !settings.token;
  sheet.innerHTML = `
    <button class="close" data-x>✕</button>
    <h2>Adicionar CD</h2>
    ${needsToken ? `
      <p class="note">Para buscar no Discogs, cole seu token pessoal (gratuito). <a href="#" data-dev>Gerar token</a></p>
      <div class="row" style="margin-top:10px"><input id="tk" type="password" placeholder="token do Discogs"><button class="primary" data-savetk style="flex:none">Salvar</button></div>` : `
      <p class="note">Digite o código de barras da contracapa (ou use um leitor USB, ele digita sozinho).</p>
      <div class="row" style="margin-top:10px"><input id="bc" inputmode="numeric" placeholder="ex.: 7 891234 567890" autofocus>
      <button class="primary" data-search style="flex:none">Buscar</button></div>
      <div id="res"></div>`}`;
  setTimeout(() => ($("bc") ?? $("tk"))?.focus(), 30);
}
function closeAdd() { modal.hidden = true; }

async function doSearch() {
  const bc = ($("bc") as HTMLInputElement).value;
  const res = $("res");
  res.innerHTML = `<p class="note">Procurando no Discogs e contando as fotos de cada versão…</p>`;
  try {
    const list = await searchBarcode(bc, settings.token);
    if (!list.length) { res.innerHTML = `<p class="err">Nenhum lançamento com esse código. Confira os números.</p>`; return; }
    res.innerHTML = `<p class="note">${list.length} prensagem(ns) encontrada(s). Escolha a que é igual à sua:</p>
      <div class="cands">${list.map((c, i) => `
        <button class="cand" data-id="${c.id}">
          ${c.thumb ? `<img src="${esc(c.thumb)}" alt="">` : `<img alt="">`}
          <div><b>${esc(c.title)}</b><small>${esc([c.country, c.year].filter(Boolean).join(" · "))}</small>
          <small>${esc([c.label, c.catno].filter(Boolean).join(" · "))}</small><small>${esc(c.format)}</small><small class="ph">${c.images} ${c.images === 1 ? "foto" : "fotos"}${i === 0 && c.images ? " · mais completa" : ""}</small></div>
        </button>`).join("")}</div>`;
  } catch (err) {
    res.innerHTML = `<p class="err">${esc(String(err))}</p>`;
  }
}

async function addRelease(id: number) {
  if (collection.some((a) => a.id === id)) { toast("Esse CD já está na coleção."); return; }
  $("res").innerHTML = `<p class="note">Baixando faixas e capas…</p>`;
  try {
    const bc = ($("bc") as HTMLInputElement).value.replace(/\D/g, "");
    const album = await fetchRelease(id, settings.token, bc);
    collection.push(album);
    await saveCollection(collection);
    rebuild();
    closeAdd();
    toast(`${album.title} entrou na prateleira! +${POINTS_PER_CD} pts`);
  } catch (err) {
    $("res").innerHTML = `<p class="err">${esc(String(err))}</p>`;
  }
}

sheet.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>("button,a");
  if (!b) return;
  const d = b.dataset;
  if (d.x !== undefined) closeAdd();
  if (d.dev !== undefined) { e.preventDefault(); openUrl("https://www.discogs.com/settings/developers"); }
  if (d.savetk !== undefined) {
    const v = ($("tk") as HTMLInputElement).value.trim();
    if (v) { setSetting("token", v, false); openAdd(); }
  }
  if (d.search !== undefined) doSearch();
  if (d.id) addRelease(Number(d.id));
});
sheet.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.target as HTMLElement).id === "bc") doSearch(); });
modal.addEventListener("click", (e) => { if (e.target === modal) closeAdd(); });

document.querySelectorAll<HTMLElement>("[data-open]").forEach((b) => {
  if (b.closest("#info")) return;
  b.addEventListener("click", () => {
    const m = b.dataset.open;
    if (m === "add") openAdd(); else if (m === "organize") toggleOrganize(); else openDrawer(m as "custom" | "shop");
  });
});

// ---------- Interação com a cena ----------
const ray = new THREE.Raycaster();
ray.params.Line = { threshold: 0 }; // as bordas do acrílico não contam como área do CD
const mouse = new THREE.Vector2(-9, -9);
const label = $("label");
let hovered: CD | null = null;
let focused: CD | null = null;
let lidTarget = 0, lidOpen = 0;
let spin = { x: 0, y: 0 };
let drag: "" | "spin" | "pan" | "item" = "";
let last = { x: 0, y: 0 };
let mouseIn = false;

let lastHit: THREE.Object3D | null = null;
function pick(): CD | null {
  if (!world || !mouseIn) return null;
  ray.setFromCamera(mouse, camera);
  const hit = ray.intersectObjects(world.cds.map((c) => c.root), true).find((h) => (h.object as THREE.Mesh).isMesh);
  lastHit = hit?.object ?? null;
  return hit ? world.cds.find((c) => { let o: THREE.Object3D | null = hit.object; while (o) { if (o === c.root) return true; o = o.parent; } return false; }) ?? null : null;
}
let savedDist = 0;
function grab(cd: CD) {
  focused = cd; spin = { x: 0, y: 0 }; lidTarget = 0;
  // garante espaço na frente da estante para o CD (com zoom muito perto ele ia parar atrás dela)
  savedDist = view.tdist;
  view.tdist = Math.max(view.tdist, FOCUS_DIST + 1.2);
  showInfo(cd.album);
}
function release() {
  if (focused && savedDist) view.tdist = savedDist;
  focused = null;
  lidTarget = 0;
  closeInfo();
}

// ---------- Modo Organizar: arrastar CDs para outro espaço e mover TV/quadros/decorações ----------
let organizing = false;
let dragCD: CD | null = null;
let dragObj: { p: Placeable; offset: THREE.Vector3 } | null = null;
const dragPlane = new THREE.Plane(), hitPoint = new THREE.Vector3();
const ghost = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: "#b3261e", transparent: true, opacity: 0.25, depthWrite: false }));
ghost.visible = false;
scene.add(ghost);

function toggleOrganize(on = !organizing) {
  organizing = on;
  if (on && focused) release();
  document.body.classList.toggle("organizing", on);
  const b = document.querySelector<HTMLElement>('[data-open="organize"]');
  if (b) b.textContent = on ? "Concluir" : "Organizar";
  $("hint").textContent = on
    ? "arraste um CD para outro espaço (pode deixar vazios) · arraste a TV, os quadros e as decorações"
    : "arraste para mover · roda para zoom · clique num CD para pegar · espaço abre o estojo · esc devolve";
}
function pickPlaceable(): Placeable | null {
  if (!world) return null;
  ray.setFromCamera(mouse, camera);
  const hit = ray.intersectObjects(world.placeables.map((p) => p.obj), true).find((h) => (h.object as THREE.Mesh).isMesh);
  if (!hit) return null;
  return world.placeables.find((p) => { let o: THREE.Object3D | null = hit.object; while (o) { if (o === p.obj) return true; o = o.parent; } return false; }) ?? null;
}
function planeFor(p: Placeable) {
  if (p.kind === "wall") return dragPlane.set(new THREE.Vector3(0, 0, 1), -p.obj.position.z);
  return dragPlane.set(new THREE.Vector3(0, 1, 0), -p.obj.position.y);
}
function rayOnPlane() {
  ray.setFromCamera(mouse, camera);
  return ray.ray.intersectPlane(dragPlane, hitPoint);
}
function moveDragged(dx: number, dy: number) {
  if (!world) return;
  if (dragCD && rayOnPlane()) {
    dragCD.root.position.set(hitPoint.x, hitPoint.y, dragCD.home.z + 0.12);
    const { home } = world.slotHome(world.slotAt(hitPoint));
    const spine = settings.display === "lombada";
    ghost.visible = true;
    ghost.position.copy(home);
    ghost.scale.set(spine ? D : W, H, spine ? W : D);
  }
  if (dragObj) {
    // Anda proporcional ao arraste do mouse (não ao ponto no chão, que "voa" visto de lado).
    const p = dragObj.p, k = view.dist * 0.00075;
    const tryMove = (axis: "x" | "y" | "z", delta: number) => {
      if (!delta) return;
      p.obj.position[axis] += delta;
      if (blocked(p)) p.obj.position[axis] -= delta; // bateu: para ali
    };
    tryMove("x", dx * k);
    if (p.kind === "wall") tryMove("y", -dy * k);
    if (p.kind === "floor") tryMove("z", dy * k * 1.4); // arrastar para baixo = trazer para frente
  }
}

/** Colisão: paredes, estante e os outros objetos do mesmo tipo (o tapete fica por baixo de tudo). */
const boxA = new THREE.Box3(), boxB = new THREE.Box3();
function blocked(p: Placeable) {
  if (!world) return false;
  boxA.setFromObject(p.obj).expandByScalar(-0.005);
  if (boxA.min.x < -world.roomHalf || boxA.max.x > world.roomHalf) return true;
  if (p.kind === "top") return boxA.min.x < -world.width / 2 || boxA.max.x > world.width / 2 || hitsOthers(p);
  if (p.kind === "floor") {
    if (boxA.min.z < world.wallZ || boxA.max.z > world.wallZ + 4.5) return true;
    if (p.id === "tapete") return false;
  }
  if (p.kind === "wall" && (boxA.min.y < world.floorY + 0.15 || boxA.max.y > world.floorY + 4)) return true;
  if (boxA.intersectsBox(world.shelfBox)) return true;
  return hitsOthers(p);
}
function hitsOthers(p: Placeable) {
  for (const o of world!.placeables) {
    if (o === p || o.kind !== p.kind || o.id === "tapete") continue;
    if (boxA.intersectsBox(boxB.setFromObject(o.obj).expandByScalar(-0.005))) return true;
  }
  return false;
}
async function dropDragged() {
  if (!world) return;
  if (dragCD) {
    const a = dragCD.album, target = world.slotAt(dragCD.root.position);
    const other = shelfAlbums().find((x) => x !== a && x.slot === target);
    if (other) other.slot = a.slot; // troca de lugar com quem estava lá
    a.slot = target;
    dragCD = null;
    ghost.visible = false;
    await saveCollection(collection);
    rebuild();
  }
  if (dragObj) {
    settings.decorRel[dragObj.p.id] = world.toRel(dragObj.p);
    saveSettings(settings);
    dragObj = null;
  }
}

// ---------- TV: clicar dá zoom na tela e toca prévias de 30 s ----------
let tvMode = false;
let tvSaved = { tx: 0, ty: 0, tdist: 7 };
const audio = new Audio();
audio.volume = Number(localStorage.getItem("cd.vol") ?? 0.8);
function setVolume(v: number) {
  v = THREE.MathUtils.clamp(v, 0, 1);
  audio.volume = v;
  try { localStorage.setItem("cd.vol", String(v)); } catch { /* ok */ }
  world?.tv.setVolume(v);
  const r = document.getElementById("tvvol") as HTMLInputElement | null;
  if (r) r.value = String(Math.round(v * 100));
}
document.getElementById("tvvol")?.addEventListener("input", (e) => setVolume(Number((e.target as HTMLInputElement).value) / 100));
let knobDrag = false;
function pickKnob() {
  if (!world?.tv.on) return false;
  ray.setFromCamera(mouse, camera);
  const h = ray.intersectObject(world.tv.knob, true).find((x) => (x.object as THREE.Mesh).isMesh);
  return !!h;
}
let tvStatus = "";
const tvbar = $("tvbar");

function pickTV() {
  if (!world?.tv.on) return false;
  ray.setFromCamera(mouse, camera);
  return ray.intersectObject(world.tv.obj, true).some((h) => (h.object as THREE.Mesh).isMesh);
}
function enterTV() {
  if (!world?.tv.on) return;
  tvMode = true;
  tvSaved = { tx: view.tx, ty: view.ty, tdist: view.tdist };
  const p = world.tv.obj.localToWorld(world.tv.screenCenter.clone());
  const sc = world.tv.obj.scale.x;
  view.tx = p.x; view.ty = p.y - 0.14 * sc; view.tdist = p.z + 2.15 * sc;
  tvbar.hidden = false;
  closeDrawer();
  setVolume(audio.volume);
  playCurrent();
}
function exitTV() {
  if (!tvMode) return;
  tvMode = false;
  audio.pause();
  world?.tv.setExternal(null);
  Object.assign(view, tvSaved);
  tvbar.hidden = true;
}
let playToken = 0;
async function playCurrent() {
  const cur = world?.tv.current();
  if (!cur) return;
  const token = ++playToken;
  const tr = cur.album.tracks[cur.ti];
  tvStatus = "buscando…";
  $("tvinfo").textContent = `${tr.title} · buscando prévia…`;
  audio.pause();
  const url = await findPreview(cur.album.artist, tr.title, cur.album.title).catch(() => null);
  if (token !== playToken || !tvMode) return;
  if (!url) {
    tvStatus = "sem prévia";
    $("tvinfo").textContent = `${tr.title} · sem prévia, pulando…`;
    setTimeout(() => { if (token === playToken && tvMode) { world?.tv.step(1); playCurrent(); } }, 1800);
    return;
  }
  audio.src = url;
  audio.play().catch(() => {});
  tvStatus = "";
  $("tvinfo").textContent = `${tr.title} — ${cur.album.artist}`;
}
audio.addEventListener("ended", () => { if (tvMode) { world?.tv.step(1); playCurrent(); } });
tvbar.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>("button");
  const a = b?.dataset.tv;
  if (!a) return;
  if (a === "exit") exitTV();
  if (a === "prev" || a === "next") { world?.tv.step(a === "next" ? 1 : -1); playCurrent(); }
  if (a === "prevAlbum" || a === "nextAlbum") { world?.tv.stepAlbum(a === "nextAlbum" ? 1 : -1); playCurrent(); }
  if (a === "toggle") { audio.paused ? audio.play().catch(() => {}) : audio.pause(); }
});
audio.addEventListener("play", () => { const b = tvbar.querySelector<HTMLElement>('[data-tv="toggle"]'); if (b) b.textContent = "Pausar"; });
audio.addEventListener("pause", () => { const b = tvbar.querySelector<HTMLElement>('[data-tv="toggle"]'); if (b) b.textContent = "Tocar"; });

// Botão esquerdo: clique pega o CD; arrastar move a vista (ou gira o CD em foco).
let downAt = { x: 0, y: 0 }, moved = false, downOnFocused = false, downOnBooklet = false;
canvas.addEventListener("pointermove", (e) => {
  mouseIn = true;
  mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  const dx = e.clientX - last.x, dy = e.clientY - last.y;
  last = { x: e.clientX, y: e.clientY };
  if (knobDrag) { setVolume(audio.volume - dy * 0.006 + dx * 0.006); return; } // girar o volume
  if (!drag) return;
  if (!moved && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 5) moved = true;
  if (!moved) return;
  if (drag === "spin") { spin.y += dx * 0.01; spin.x += dy * 0.01; }
  if (drag === "item") moveDragged(dx, dy);
  if (drag === "pan") { const k = view.dist * 0.0011; view.tx -= dx * k; view.ty += dy * k; clampView(); }
});
canvas.addEventListener("pointerleave", () => (mouseIn = false));
canvas.addEventListener("contextmenu", (e) => e.preventDefault());
canvas.addEventListener("pointerdown", (e) => {
  last = downAt = { x: e.clientX, y: e.clientY };
  moved = false;
  canvas.setPointerCapture(e.pointerId);
  if (tvMode && pickKnob()) { knobDrag = true; drag = ""; return; }
  if (organizing) {
    const cd = pick();
    if (cd) { dragCD = cd; dragPlane.set(new THREE.Vector3(0, 0, 1), -cd.home.z); drag = "item"; return; }
    const p = pickPlaceable();
    if (p) {
      dragObj = { p, offset: new THREE.Vector3() }; drag = "item"; return;
    }
  }
  downOnFocused = !!focused && pick() === focused;
  downOnBooklet = downOnFocused && lidOpen > 0.5 && !!lastHit?.userData.booklet;
  drag = focused ? (downOnFocused ? "spin" : "") : tvMode ? "" : "pan";
});
canvas.addEventListener("pointerup", () => {
  if (knobDrag) { knobDrag = false; return; }
  if (drag === "item") { drag = ""; if (moved) dropDragged(); else { dragCD = null; dragObj = null; ghost.visible = false; } return; }
  if (!moved && !organizing) {
    if (focused) {
      if (!downOnFocused) release(); // clique fora do CD = devolver
      else if (downOnBooklet) openBooklet(focused.album); // clique no encarte aberto = folhear
    }
    else if (tvMode) { if (!pickTV()) exitTV(); }
    else { const cd = pick(); if (cd) grab(cd); else if (pickTV()) enterTV(); }
  }
  drag = "";
});
canvas.addEventListener("dblclick", () => {
  // duplo clique na tela da TV: troca de álbum
  if (!focused && !organizing && world?.tv.on) {
    ray.setFromCamera(mouse, camera);
    if (ray.intersectObject(world.tv.screen).length) {
      world.tv.stepAlbum(1);
      if (tvMode) playCurrent();
      return;
    }
  } if (focused) { lidTarget = lidTarget > 0.5 ? 0 : 1; showInfo(focused.album); } });
canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  if (tvMode && pickKnob()) { setVolume(audio.volume - Math.sign(e.deltaY) * 0.05); return; }
  if (focused || tvMode) return;
  const step = THREE.MathUtils.clamp(e.deltaY, -120, 120) * 0.0007;
  const before = view.tdist;
  view.tdist = THREE.MathUtils.clamp(view.tdist * Math.exp(step), MIN_DIST, fitDist * 1.25);
  // ao aproximar, a vista vai suavemente na direção do mouse (para chegar perto das lombadas)
  if (view.tdist < before) {
    const half = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * view.dist;
    const k = (before - view.tdist) / before;
    view.tx += mouse.x * half * camera.aspect * k;
    view.ty += mouse.y * half * k;
  }
  clampView();
}, { passive: false });
addEventListener("keydown", (e) => {
  if ((e.target as HTMLElement).tagName === "INPUT") return;
  if (!lightbox.hidden && lightbox.dataset.mode === "book" && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
    turnPage(e.key === "ArrowRight" ? 1 : -1); return;
  }
  if (e.key === "Escape" && organizing) { toggleOrganize(false); return; }
  if (e.key === "Escape" && tvMode) { exitTV(); return; }
  if (e.key === "Escape") { if (!lightbox.hidden) lightbox.hidden = true; else if (!modal.hidden) closeAdd(); else if (focused) release(); else closeDrawer(); }
  if (e.key === " " && focused) { e.preventDefault(); lidTarget = lidTarget > 0.5 ? 0 : 1; showInfo(focused.album); }
  if (e.key === "0") frameShelf();
});

// ---------- Loop ----------
function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  const w = Math.max(1, Math.floor(innerWidth / settings.pixel)), h = Math.max(1, Math.floor(innerHeight / settings.pixel));
  lowRes.setSize(w, h);
  crt.uniforms.res.value.set(w, h);
  crt.uniforms.amt.value = settings.crt;
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener("resize", () => { resize(); });

const clock = new THREE.Clock();
const v3 = new THREE.Vector3(), q = new THREE.Quaternion(), eul = new THREE.Euler();
const fwd = new THREE.Vector3(), right = new THREE.Vector3();

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  const ease = (r: number) => 1 - Math.exp(-dt * r);

  // câmera com leve paralaxe do mouse
  view.x += (view.tx - view.x) * ease(8);
  view.y += (view.ty - view.y) * ease(8);
  view.dist += (view.tdist - view.dist) * ease(8);
  const par = focused || !mouseIn ? 0 : 0.15;
  camera.position.set(view.x + mouse.x * par, view.y + 0.15 + mouse.y * par * 0.5, view.dist);
  camera.lookAt(view.x, view.y, 0);

  hovered = focused || drag ? null : pick();
  canvas.dataset.cur = moved && drag ? "drag" : hovered || (!focused && !tvMode && !drag && world?.tv.on && pickTV()) ? "pick" : focused ? "turn" : "idle";
  label.classList.toggle("show", !!hovered);
  if (hovered) label.textContent = `${hovered.album.title}\n${hovered.album.artist}`;

  for (const cd of world?.cds ?? []) {
    if (cd === focused || cd === dragCD) continue;
    // hover: o CD sobe ("será que vai ser escolhido?"), balança e volta quando o mouse sai
    const target = cd === hovered ? 1 : 0;
    cd.hover += (target - cd.hover) * ease(target ? 12 : 7);
    const bob = Math.sin(t * 3 + cd.phase) * 0.018 * cd.hover;
    v3.set(cd.home.x, cd.home.y + cd.hover * 0.22 + bob, cd.home.z + cd.hover * 0.14);
    cd.root.position.lerp(v3, ease(14));
    eul.set(cd.baseRot.x + cd.hover * 0.12, cd.baseRot.y + Math.sin(t * 2 + cd.phase) * 0.05 * cd.hover, Math.sin(t * 2.4 + cd.phase) * 0.025 * cd.hover);
    cd.root.quaternion.slerp(q.setFromEuler(eul), ease(14));
    cd.root.scale.lerp(v3.setScalar(1 + cd.hover * 0.05), ease(14));
    cd.lid.rotation.y += (0 - cd.lid.rotation.y) * ease(10);
  }

  if (focused) {
    // voa até a frente da câmera, um pouco à esquerda do painel de faixas
    camera.getWorldDirection(fwd);
    right.crossVectors(fwd, camera.up).normalize();
    // centro da área livre (à esquerda do painel de faixas), na distância de foco
    const panelPx = info.hidden ? 0 : info.offsetWidth + 28;
    const ndcX = (innerWidth - panelPx) / innerWidth - 1;
    const halfW = FOCUS_DIST * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect;
    v3.copy(camera.position).addScaledVector(fwd, FOCUS_DIST).addScaledVector(right, ndcX * halfW + lidOpen * 0.3);
    focused.root.position.lerp(v3, ease(6));
    if (drag !== "spin") spin.y += dt * 0.2 * (1 - lidTarget);
    eul.set(spin.x, spin.y + Math.sin(t) * 0.04, 0);
    focused.root.quaternion.slerp(q.setFromEuler(eul), ease(8));
    focused.root.scale.lerp(v3.setScalar(1), ease(6));
    lidOpen += (lidTarget - lidOpen) * ease(5);
    focused.lid.rotation.y = -lidOpen * 1.95;
    focused.disc.rotation.z -= dt * 0.6 * lidOpen; // o disco gira devagar quando aberto
  }

  if (tvMode && world) {
    const cur = world.tv.current();
    if (cur) world.tv.setExternal({
      album: cur.album, ti: cur.ti, el: audio.currentTime || 0, dur: audio.duration || 30,
      playing: !audio.paused, status: tvStatus || (audio.paused ? "❚❚" : "▶"),
    });
  }
  world?.tick(t);
  crt.uniforms.time.value = t;
  renderer.setRenderTarget(lowRes);
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);
  renderer.render(postScene, postCam);
});

// ---------- Início ----------
resize();
rebuild(true);
document.fonts.ready
  .then(async () => { settings = await syncSettings(settings); resize(); return loadCollection(); })
  .then((c) => {
    collection = c;
    rebuild(true);
    saveCollection(collection); // guarda as posições na estante
    if (world?.hidden) toast(`${world.hidden} CD(s) não couberam. Aumente a estante em Sala.`);
  })
  .catch((e) => toast(`Erro ao abrir a coleção: ${e}`));
