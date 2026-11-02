/* このファイルは tools/make_supply_model.py が shooter-concept.html から作ります。手で直さないでください。
   工場全体の3D（scene3d.js）の「生産ライン横の部品供給」に、詳しい表示（supply.html）と同じ棚・MoMa・動きを置く。 */
window.SupplyModel = (function () {
'use strict';
let AREA = null;
/* =====================================================================
   CONFIG（config.js 相当）
   本案「縦型省スペース型」の寸法と隙間のルール。CAD（cad/shooter-space/params.py）と同じ値・同じ計算で
   段の高さを決める。数値を変えて再読み込みすると、3D・寸法・右パネル・比較表がまとめて変わる。
   単位は mm / kg / 秒。出典のない値は仮値。
   ===================================================================== */
const CONFIG = {
  moma: {
    // LexxMoMa R1（詳細仕様・説明資料より。図から読んだ値は「図から」と書く）
    baseL: 700, baseW: 650,                // 車体サイズ D700（前後）×W650（左右）×H750（詳細仕様・アームを除く）
    chassisH: 200,                         // 走行台車の枠の上面（図から）
    bodyH: 750,                            // 車体の高さ＝アームの取付面（詳細仕様）
    armX: 0,                               // アームの取付位置：車体の中心
    reachH: [250, 2400],                   // 高さ方向のリーチ 0.25〜2.4m以上（詳細仕様）
    storage: { L: 250, W: 600, H: 450 },   // 収納エリア 前後250×左右600×高さ450（資料）
    arm: 'FANUC CRX-20iA/L',               // 搭載アーム（資料）
    armReach: 1418,                        // 最大到達（資料）。水平方向 ±1.4m以上（詳細仕様）
    j2H: 245,                              // 取付面からJ2（肩）まで（図から）
    upper: 710, fore: 540, wrist: 168,     // J2→J3、J3→J5、J5→先端（図から。合計は最大到達1418）
    j5Moment: 64,                          // 手首J5の許容負荷モーメント Nm（CRX-20iA/L カタログ）
    keepOut: 50,                           // 機体まわりの進入禁止域（説明資料：アームのどの部分も入ってはならない）
    linkR: [62, 50, 50],                   // 干渉の計算に使う太さ（半径）：上腕・前腕・手首（図から・仮）。ハンドの胴と爪の板は箱で計算
    deckStand: 30,                         // 天面の箱置き台の高さ（ハンドが進入禁止域に入らず、肩の上腕が箱に当たらない高さ・仮）
    syncPull: { low: 300, high: 200, ret: 250 },   // シンクロ動作：箱の出し入れの前後の移動（約550mm）のうち腕が受け持つ量（低い段・高い段・返却段）。残りを台車の前進・後退で動く（仮）
    deckBack: 40,                          // 天面の箱置きを車体の後ろへずらす量（棚に向いたとき、天面の箱を掴む手首が進入禁止域に入らない・仮）
    deckGap: 130,                          // アームの軸から天面の箱の端まで（上腕の付け根に当たらない距離・仮）
    payloadKg: 20,                         // 定格可搬（資料）。停止中に20kgを扱えるのは到達約1100mmまで、最大到達では約11kg
    gripLen: 150,                          // グリッパの長さ（仮）
    maxBoxes: 2,                           // 天面の前側に積む箱数（仮）。2段に積んだ箱は肩より高いので、そのときアームは棚の正面（-z）に向けない
    aisleTurn: 1500,                       // 旋回に必要な通路幅（仮）
    clearance: 150,                        // 棚の通路側の面と機体のすき間（仮）
  },
  shooter: { pickHmin: 700, pickHmax: 1500 },   // 取り出し段：置き面の下限・箱の上端の上限（仮）
  box: { gap: 10 },                              // 奥行き方向の箱どうしの隙間
  worker: { height: 1700 },
  line: { zoneDepth: 1500 },
  estimate: { utilization: 0.75, boxesPerLanePerHour: 1.5 },   // 担当間口数の目安の計算用（仮）
  // TP規格コンテナ（岐阜プラスチック工業の掲載寸法・外寸）。底面は 167.5mm のモジュールの倍数
  tp: {
    module: 167.5,
    types: {
      'TP-331.5B': { L: 335, W: 335, H: 149, liter: 11 },
      'TP-341.5B': { L: 503, W: 335, H: 149, liter: 17 },
      'TP-391.5B': { L: 1005, W: 335, H: 149, liter: 35 },
    },
    fullKg: 9,   // 部品入りの重さの想定（仮）
  },
  plan: {
    mainType: 'TP-341.5B',
    cols: 4, deep: 2,             // 4列、奥に2箱。空箱返却は人の作業域のすぐ上の段
    mix: { '1-2': 'TP-391.5B', '2-3': 'TP-331.5B' },   // 「列-段」ごとの箱（段は下から0始まり）
    pipeD: 28,                    // Φ28パイプ（イレクター相当・掲載値）
    structBelow: 54,              // 置き面から下の構造：ローラーレール26（仮）＋受けパイプ28
    sideClear: 10,                // 箱とガイドの片側の隙間（仮）
    stopOff: 15, rearClear: 40,   // 前端ストッパーの厚さ、通路側の入れ口の余裕（仮）
    slopePct: 4,                  // ローラーの勾配（仮）
    floorMin: 120,                // 最下段の置き面の下限（仮）
    momaCenterMin: 270,           // MoMaが扱う箱の中心の最低。詳細仕様のリーチは0.25mだが、列の正面から横にずれた停止で爪を下から掛けに行くとき上腕が進入禁止域に入らない高さ（干渉の計算）
    momaLat: 190,                 // 停止位置から間口の中心までの横ずれの最大（2列ごとに止まる・仮）
    rackMaxH: 2500,               // 棚の高さの上限（建屋・照明・見通し・仮）
    panel: 5,                     // ライン側の閉じ板の厚さ
    exitStopH: 20,                // 予備在庫・返却の出口ストッパーの高さ（仮）
    hookLift: 25,                 // 取り出すときにフックで持ち上げる高さ（ストッパー＋5mm）
    gap: {                        // 段の上の空き [ライン側, 通路側]（仮）
      pick: [100, 60],            // ライン側：手を入れて部品を取る / 通路側：箱を入れる
      return: [40, 40], returnf: [40, 40],   // ライン側：人が空箱を滑り込ませる（仮） / 通路側：フックで持ち上げて取り出す
      reserve: [15, 40],          // ライン側は閉じ板で転がるだけ。通路側はフックで出口ストッパーの上へ持ち上げる分
    },
    secPerBox: 60,                // 1箱の補充時間（走行込み・仮）
    compare: [
      { title: 'A 従来型：傾斜ローラー 4列×3段×奥3箱＋最上段に返却', cols: 4, deep: 3, retMode: 'top', low: 0, high: 0 },
      { title: '参考：空箱返却を1列にあてる案（5列）', cols: 5, deep: 2, retMode: 'column' },
    ],
  },
  colors: {
    blue: '#0068B7', green: '#3EB370', retro: '#5AA0DC', frame: '#D9D3C0', roller: '#C5CDD3',
    powered: '#8FA9BF', plate: '#EEF2F5', empty: '#CDD5DB', dim: '#4F6575', floor: '#F7F9FA',
    sku: ['#2F6FB3', '#3D7FC4', '#285F9C', '#4A8ACB', '#22558C', '#3570B0'],
    tp: { 'TP-341.5B': '#2F6FB3', 'TP-331.5B': '#3C9A5F', 'TP-391.5B': '#E58F26' },
  },
};
// アームの届く範囲（CAD の reach.py で計算した結果）。rows: [箱の中心の高さ, 停止距離の最小, 最大]（棚の面から肩まで mm）
const REACH = {"lo": 270, "hi": 2200, "rows": [[250, 850, 1075], [275, 775, 1100], [300, 775, 1100], [325, 800, 1100], [350, 800, 1100], [375, 800, 1100], [400, 800, 1100], [425, 800, 1100], [450, 825, 1100], [475, 825, 1100], [500, 825, 1100], [525, 825, 1100], [550, 800, 1100], [575, 800, 1100], [600, 800, 1100], [625, 800, 1100], [650, 800, 1100], [675, 800, 1100], [700, 775, 1100], [725, 775, 1100], [750, 775, 1100], [775, 775, 1100], [800, 775, 1100], [825, 775, 1100], [850, 750, 1100], [875, 700, 1100], [900, 700, 1100], [925, 675, 1100], [950, 650, 1100], [975, 625, 1100], [1000, 600, 1100], [1025, 575, 1100], [1050, 550, 1100], [1075, 525, 1100], [1100, 500, 1100], [1125, 500, 1100], [1150, 500, 1100], [1175, 500, 1100], [1200, 500, 1100], [1225, 500, 1100], [1250, 500, 1100], [1275, 500, 1100], [1300, 500, 1100], [1325, 500, 1100], [1350, 500, 1100], [1375, 500, 1100], [1400, 500, 1100], [1425, 500, 1100], [1450, 500, 1100], [1475, 500, 1100], [1500, 500, 1100], [1525, 500, 1100], [1550, 500, 1100], [1575, 500, 1100], [1600, 500, 1100], [1625, 500, 1100], [1650, 500, 1100], [1675, 500, 1100], [1700, 500, 1100], [1725, 500, 1100], [1750, 500, 1100], [1775, 500, 1100], [1800, 500, 1100], [1825, 500, 1100], [1850, 500, 1100], [1875, 500, 1100], [1900, 500, 1100], [1925, 500, 1075], [1950, 500, 1050], [1975, 500, 1025], [2000, 500, 975], [2025, 500, 950], [2050, 500, 900], [2075, 500, 875], [2100, 500, 825], [2125, 500, 750], [2150, 500, 700], [2175, 500, 625], [2200, 500, 500]], "side": [[250, 525, 800], [275, 450, 850], [300, 450, 900], [325, 450, 900], [350, 450, 900], [375, 450, 900], [400, 450, 900], [425, 450, 900], [450, 450, 900], [475, 450, 900], [500, 450, 900], [525, 450, 900], [550, 450, 900], [575, 450, 900], [600, 450, 900], [625, 450, 900], [650, 450, 900], [675, 450, 900], [700, 450, 900], [725, 450, 900], [750, 450, 900], [775, 450, 900], [800, 450, 900], [825, 450, 900], [850, 425, 900], [875, 250, 900], [900, 250, 900], [925, 225, 900], [950, 225, 900], [975, 200, 900], [1000, 175, 900], [1025, 150, 900], [1050, 125, 900], [1075, 50, 900], [1100, 0, 900], [1125, 0, 900], [1150, 0, 900], [1175, 0, 900], [1200, 0, 900], [1225, 0, 900], [1250, 0, 900], [1275, 0, 900], [1300, 0, 900], [1325, 0, 900], [1350, 0, 900], [1375, 0, 900], [1400, 0, 900], [1425, 0, 900], [1450, 0, 900], [1475, 0, 900], [1500, 0, 900], [1525, 0, 900], [1550, 0, 900], [1575, 0, 900], [1600, 0, 900], [1625, 0, 900], [1650, 0, 900], [1675, 0, 900], [1700, 0, 900], [1725, 0, 900], [1750, 0, 900], [1775, 0, 900], [1800, 0, 900], [1825, 0, 875], [1850, 0, 850], [1875, 0, 825], [1900, 0, 800], [1925, 0, 750], [1950, 0, 725], [1975, 0, 700], [2000, 0, 650], [2025, 0, 625], [2050, 0, 575], [2075, 0, 525], [2100, 0, 475], [2125, 0, 425], [2150, 0, 350], [2175, 0, 250], [2200, 0, 75]], "kg": 9.0, "Fmin": 500, "Fmax": 1100, "lift": 25.0};
/* ===================== 基本ユーティリティ ===================== */
const C = CONFIG, COL = CONFIG.colors;
const M = v => v / 1000;                      // mm → m（3D空間は 1単位 = 1m）
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const mm = v => Math.round(v * 1000);         // m → mm 表示
const shade = (hex, amt) => { const c = new THREE.Color(hex); c.lerp(new THREE.Color(amt > 0 ? '#ffffff' : '#000000'), Math.abs(amt)); return '#' + c.getHexString(); };
const _mc = {};
function mat(color, o = {}) { const k = color + JSON.stringify(o); return _mc[k] || (_mc[k] = new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.72, metalness: 0.05 }, o))); }
function mesh(geo, m, shadow = true) { const x = new THREE.Mesh(geo, m); x.castShadow = shadow; x.receiveShadow = true; return x; }
function addBox(parent, sx, sy, sz, color, x, y, z, o = {}) {
  const b = mesh(new THREE.BoxGeometry(sx, sy, sz), typeof color === 'string' ? mat(color, o.m || {}) : color);
  b.position.set(x, y, z); if (o.rx) b.rotation.x = o.rx; if (o.ry) b.rotation.y = o.ry; parent.add(b); return b;
}
const FONT = '"Noto Sans JP","Hiragino Kaku Gothic ProN","Yu Gothic","Meiryo","IPAGothic",sans-serif';
const _tc = {};
function textTex(lines, o = {}) {
  const key = JSON.stringify([lines, o]); if (_tc[key]) return _tc[key];
  const w = o.w || 256, h = o.h || 128, c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = o.bg || '#fff'; g.fillRect(0, 0, w, h);
  if (o.border) { g.strokeStyle = o.border; g.lineWidth = 8; g.strokeRect(4, 4, w - 8, h - 8); }
  const fs = o.font || 34, top = o.bars ? h * 0.34 : h / 2;
  g.fillStyle = o.fg || '#1d2a33'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `700 ${fs}px ${FONT}`;
  lines.forEach((s, i) => g.fillText(s, w / 2, top + (i - (lines.length - 1) / 2) * fs * 1.18));
  if (o.bars) {                                 // バーコード風の模様（文字列から決まる）
    g.fillStyle = '#fff'; g.fillRect(w * 0.18, h * 0.6, w * 0.64, h * 0.32);
    let seed = 0; for (const ch of lines.join('')) seed = (seed * 31 + ch.charCodeAt(0)) % 9973;
    g.fillStyle = '#111'; let x = w * 0.2;
    while (x < w * 0.8) { seed = (seed * 73 + 41) % 9973; const bw = 1 + seed % 4; g.fillRect(x, h * 0.63, bw, h * 0.26); x += bw + 1 + (seed >> 3) % 3; }
  }
  const t = new THREE.CanvasTexture(c); t.anisotropy = 4;
  return (_tc[key] = t);
}
function texMat(lines, o) { const k = 'T' + JSON.stringify([lines, o]); return _mc[k] || (_mc[k] = new THREE.MeshStandardMaterial({ map: textTex(lines, o), roughness: 0.8 })); }
function plane(parent, w, h, m, x, y, z, ry = 0) { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); p.position.set(x, y, z); p.rotation.y = ry; parent.add(p); return p; }

/* ===================== 視点操作（OrbitControls 相当・自作） ===================== */
class Orbit {
  constructor(cam, dom) {
    this.cam = cam; this.dom = dom; this.target = V3(); this.r = 6; this.th = 0.8; this.ph = 1.0;
    this.ptr = new Map(); this.onChange = null;
    dom.addEventListener('contextmenu', e => e.preventDefault());
    dom.addEventListener('pointerdown', e => { dom.setPointerCapture(e.pointerId); this.ptr.set(e.pointerId, { x: e.clientX, y: e.clientY, b: e.button, s: e.shiftKey || e.ctrlKey || e.metaKey }); });
    dom.addEventListener('pointermove', e => this.move(e));
    const up = e => { this.ptr.delete(e.pointerId); this.pinch = null; };
    dom.addEventListener('pointerup', up); dom.addEventListener('pointercancel', up);
    dom.addEventListener('wheel', e => { e.preventDefault(); this.zoom(Math.exp(e.deltaY * 0.0012)); }, { passive: false });
  }
  set(pos, target) {
    this.target.copy(target); const d = pos.clone().sub(target);
    this.r = d.length(); this.ph = Math.acos(clamp(d.y / this.r, -1, 1)); this.th = Math.atan2(d.x, d.z); this.update();
  }
  zoom(f) { this.r = clamp(this.r * f, 1.2, 30); this.update(); }
  pan(dx, dy) {
    const s = this.r * 0.0016, cam = this.cam;
    const right = V3().setFromMatrixColumn(cam.matrix, 0), upv = V3().setFromMatrixColumn(cam.matrix, 1);
    this.target.addScaledVector(right, -dx * s).addScaledVector(upv, dy * s); this.update();
  }
  move(e) {
    const p = this.ptr.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    if (this.ptr.size === 2) {
      const [a, b] = [...this.ptr.values()]; p.x = e.clientX; p.y = e.clientY;
      const dist = Math.hypot(a.x - b.x, a.y - b.y), mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (this.pinch) { this.zoom(this.pinch.d / dist); this.pan(mid.x - this.pinch.m.x, mid.y - this.pinch.m.y); }
      this.pinch = { d: dist, m: mid }; return;
    }
    p.x = e.clientX; p.y = e.clientY;
    if (p.b === 2 || p.b === 1 || p.s) this.pan(dx, dy);
    else { this.th -= dx * 0.006; this.ph = clamp(this.ph - dy * 0.006, 0.08, Math.PI / 2 - 0.02); this.update(); }
  }
  update() {
    const s = Math.sin(this.ph);
    this.cam.position.set(this.target.x + this.r * s * Math.sin(this.th), this.target.y + this.r * Math.cos(this.ph), this.target.z + this.r * s * Math.cos(this.th));
    this.cam.lookAt(this.target); this.cam.updateMatrixWorld();
  }
}

/* ===================== 部位ラベル・寸法線 ===================== */
let LABELS = [], DIMS = [], ROOT = null;
const labelLayer = document.createElement('div');   // 工場全体の中では部位ラベルを出さない
function label(target, html, kind = '', off = V3()) {
  const el = document.createElement('div'); el.className = 'lbl ' + kind; el.innerHTML = html; labelLayer.appendChild(el);
  const L = { el, target, off, kind }; LABELS.push(L); return L;
}
function unlabel(L) { if (!L) return; L.el.remove(); LABELS = LABELS.filter(x => x !== L); }
function visibleChain(o) { while (o) { if (!o.visible) return false; o = o.parent; } return true; }
const _pv = V3();
function updateLabels(cam, w, h) {
  const showL = document.getElementById('chkLbl').checked, showD = document.getElementById('chkDim').checked;
  const fixed = [], movable = [];
  for (const L of LABELS) {
    const isDim = L.kind.includes('dim'), isFlash = L.kind.includes('flash') || L.kind.includes('warn');
    let show = isDim ? showD : (showL || isFlash);
    if (L.target.isObject3D) { if (!visibleChain(L.target)) show = false; _pv.copy(L.off); L.target.localToWorld(_pv); }
    else _pv.copy(L.target);
    _pv.project(cam);
    if (!show || _pv.z > 1 || Math.abs(_pv.x) > 1.3 || Math.abs(_pv.y) > 1.3) { L.el.style.display = 'none'; continue; }
    if (L.el.style.display === 'none' || !L.w) { L.el.style.display = ''; L.w = L.el.offsetWidth; L.h = L.el.offsetHeight; }
    L.x = (_pv.x * 0.5 + 0.5) * w; L.y = (-_pv.y * 0.5 + 0.5) * h; L.depth = _pv.z;
    (isDim || L.kind.includes('zone') ? fixed : movable).push(L);
  }
  // 重なりを避ける：寸法・床の表示は固定、部位ラベルは重なったら上へずらし、引き出し線を伸ばす
  const placed = [];
  for (const L of fixed) { const r = { l: L.x - L.w / 2, t: L.y - L.h / 2, r: L.x + L.w / 2, b: L.y + L.h / 2 }; placed.push(r); L.el.style.transform = `translate(${r.l}px,${r.t}px)`; }
  movable.sort((a, b) => (b.kind.includes('flash') - a.kind.includes('flash')) || (b.y - a.y));
  for (const L of movable) {
    const r = { l: L.x - L.w / 2, r: L.x + L.w / 2, b: L.y - 9, t: L.y - 9 - L.h };
    for (let k = 0; k < 8; k++) {
      const hit = placed.find(p => r.l < p.r + 2 && r.r > p.l - 2 && r.t < p.b + 2 && r.b > p.t - 2);
      if (!hit) break;
      const up = r.b - (hit.t - 3); r.t -= up; r.b -= up;
    }
    placed.push(r);
    L.el.style.setProperty('--lh', Math.max(9, L.y - r.b) + 'px');
    L.el.style.transform = `translate(${r.l}px,${r.t}px)`;
  }
}
const dimMat = new THREE.LineBasicMaterial({ color: COL.dim });
function dimLine(parent, a, b, text, tickDir) {
  const d = b.clone().sub(a).normalize();
  const t = (tickDir || (Math.abs(d.y) > 0.9 ? V3(1, 0, 0) : V3(0, 1, 0))).clone().multiplyScalar(0.04);
  const pts = [a, b, a.clone().add(t), a.clone().sub(t), b.clone().add(t), b.clone().sub(t)];
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const ln = new THREE.LineSegments(geo, dimMat); parent.add(ln); DIMS.push(ln);
  label(a.clone().add(b).multiplyScalar(0.5), text, 'dim'); return ln;
}
function dashedRing(parent, r, color) {
  const pts = []; for (let i = 0; i <= 96; i++) { const a = i / 96 * Math.PI * 2; pts.push(V3(Math.cos(a) * r, 0, Math.sin(a) * r)); }
  const ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color, dashSize: 0.05, gapSize: 0.04, transparent: true, opacity: 0.8 }));
  ln.computeLineDistances(); parent.add(ln); DIMS.push(ln); return ln;
}
function rectLine(parent, x0, x1, z0, z1, color, dashed) {
  const pts = [V3(x0, 0.006, z0), V3(x1, 0.006, z0), V3(x1, 0.006, z1), V3(x0, 0.006, z1), V3(x0, 0.006, z0)];
  const m = dashed ? new THREE.LineDashedMaterial({ color, dashSize: 0.08, gapSize: 0.05 }) : new THREE.LineBasicMaterial({ color });
  const ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), m); if (dashed) ln.computeLineDistances(); parent.add(ln); return ln;
}
function makeBeam(color = COL.blue) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 1, 6), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 })); ROOT.add(b); return b; }
function setBeam(b, a, c) { b.position.copy(a).add(c).multiplyScalar(0.5); const d = c.clone().sub(a); b.scale.set(1, Math.max(d.length(), 1e-3), 1); b.quaternion.setFromUnitVectors(V3(0, 1, 0), d.normalize()); }
function wp(o, local = V3()) { o.updateWorldMatrix(true, false); return o.localToWorld(local.clone()); }

/* ===================== 部品：標準箱・キット箱 ===================== */
function makeBox(dim, o = {}) {
  const color = o.color || COL.sku[0], code = o.code || '';
  const g = new THREE.Group(), geo = new THREE.BoxGeometry(dim.x, dim.y, dim.z);
  const fs = Math.round(34 * Math.min(1, dim.y / 0.2 * 1.1));
  const mats = c => { const side = mat(c), top = mat(shade(c, 0.18));
    return [side, side, top, side, texMat([o.emptyText || code], { bg: c, fg: '#fff', bars: true, font: fs }), texMat([o.emptyText || code], { bg: c, fg: '#fff', font: fs + 4 })]; };
  const m = mesh(geo, mats(color)); g.add(m);
  for (const sz of [-1, 1]) plane(g, Math.min(0.11, dim.x * 0.4), 0.026, mat('#1d2a33'), 0, dim.y / 2 - 0.04, sz * (dim.z / 2 + 0.0015), sz > 0 ? 0 : Math.PI);   // 短辺の取っ手穴
  const ed = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: shade(color, -0.35) })); g.add(ed);
  g.userData = { dim, code, kind: 'box',
    setEmpty() { o.emptyText = '空箱'; m.material = mats(COL.empty); ed.material.color.set(shade(COL.empty, -0.35)); g.userData.empty = true; } };
  return g;
}
/* ===================== 部品：レーン（傾斜ローラー・平板・電動） ===================== */
function makeLane(parent, o) {
  const box = o.box, gap = o.gap ?? M(C.box.gap), stopOff = o.stopOff ?? 0.02;
  const dz = o.zB - o.zF, dy = o.yB - o.yF, L = Math.hypot(dz, dy), rx = -Math.atan(dy / dz), uz = dz / L, uy = dy / L;
  const pt = s => V3(o.x, o.yF + uy * s, o.zF + uz * s);
  if (!o.noDraw) {
    const dw = o.drawW ?? o.w, dx = o.drawX ?? o.x, mid = pt(L / 2), rm = mat(o.railColor || COL.frame);
    for (const sx of [-1, 1]) { const r = mesh(new THREE.BoxGeometry(0.03, 0.05, L), rm); r.position.set(dx + sx * (dw / 2 + 0.015), mid.y - 0.022, mid.z); r.rotation.x = rx; parent.add(r); }
    if (o.type === 'flat') { const p = mesh(new THREE.BoxGeometry(dw, 0.016, L), mat(o.plateColor || COL.plate)); p.position.set(dx, mid.y - 0.008, mid.z); p.rotation.x = rx; parent.add(p); }
    else {
      const n = Math.max(2, Math.floor(L / 0.085)), rg = new THREE.CylinderGeometry(0.018, 0.018, dw, 10);
      const rmat = mat(o.type === 'powered' ? COL.powered : COL.roller, { metalness: 0.35, roughness: 0.4 });
      for (let i = 0; i < n; i++) { const p = pt((i + 0.5) * L / n); const r = mesh(rg, rmat, false); r.rotation.z = Math.PI / 2; r.position.set(dx, p.y - 0.019, p.z); parent.add(r); }
    }
  }
  const lane = {
    parent, o, L, rx, pt, box, pitch: box.z + gap, q: [], stopOff,
    sAt(i) { return stopOff + box.z / 2 + i * this.pitch; },
    posS(s) { const p = pt(s); p.y += box.y / 2 + 0.001; return p; },
    wpos(s) { parent.updateWorldMatrix(true, false); return parent.localToWorld(this.posS(s)); },
    entryS: L - box.z / 2 - 0.012,
  };
  lane.cap = Math.floor((L - stopOff + gap) / lane.pitch);
  return lane;
}
function putOnLane(lane, box, i) { lane.parent.add(box); box.userData.s = lane.sAt(i); box.position.copy(lane.posS(box.userData.s)); box.rotation.set(lane.rx, 0, 0); lane.q.push(box); return box; }
function posts(parent, xs, zs, H, color = COL.frame) {
  for (const x of xs) for (const z of zs) addBox(parent, 0.04, H, 0.04, color, x, H / 2, z);
  const span = xs[xs.length - 1] - xs[0];
  for (const z of zs) { addBox(parent, span + 0.04, 0.04, 0.04, color, (xs[0] + xs[xs.length - 1]) / 2, H, z); addBox(parent, span + 0.04, 0.03, 0.03, color, (xs[0] + xs[xs.length - 1]) / 2, 0.08, z); }
  for (const x of xs) addBox(parent, 0.04, 0.04, zs[zs.length - 1] - zs[0], color, x, H, (zs[0] + zs[zs.length - 1]) / 2);
}
function makeMarker(parent, x, y, z, size = 0.12, seed = 1, ry = 0) {
  const k = 'mk' + seed; let t = _tc[k];
  if (!t) {
    const c = document.createElement('canvas'); c.width = c.height = 70; const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, 70, 70); g.fillStyle = '#000'; g.fillRect(5, 5, 60, 60); g.fillStyle = '#fff';
    let s = seed * 97 + 13; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { s = (s * 73 + 29) % 1013; if (s % 2 || (i === 0 && j === 0)) g.fillRect(15 + i * 10, 15 + j * 10, 10, 10); }
    t = _tc[k] = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter;
  }
  const p = plane(parent, size, size, new THREE.MeshBasicMaterial({ map: t }), x, y, z, ry); return p;
}
function lamp(parent, x, y, z, color, on) {
  const m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: on ? 0.9 : 0.05, transparent: true, opacity: on ? 1 : 0.45 });
  const l = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.06, 16), m, false); l.position.set(x, y, z); parent.add(l);
  l.userData.set = v => { m.emissiveIntensity = v ? 0.9 : 0.05; m.opacity = v ? 1 : 0.45; }; return l;
}

/* ===================== 床・作業域 ===================== */
function env(root, o) {
  const xMin = o.xMin ?? -4.8, xMax = o.xMax ?? 4.8, lz = M(C.line.zoneDepth), aw = M(C.moma.aisleTurn);
  const fl = mesh(new THREE.PlaneGeometry(xMax - xMin + 2, lz + o.zB + aw + 4), mat(COL.floor), false); fl.rotation.x = -Math.PI / 2;
  fl.position.set((xMin + xMax) / 2, 0, (o.zB + aw - lz) / 2);
  const grid = new THREE.GridHelper(16, 32, 0xdde4ea, 0xedf1f4); grid.position.set(0, 0.001, (o.zB + aw - lz) / 2);
  const zone = (z0, z1, color, op) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(xMax - xMin, z1 - z0), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, depthWrite: false })); p.rotation.x = -Math.PI / 2; p.position.set((xMin + xMax) / 2, 0.003, (z0 + z1) / 2); root.add(p); };
  zone(-lz, 0, COL.green, 0.15); zone(o.zB, o.zB + aw, COL.blue, 0.09);
  const edge = (z, color) => { const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([V3(xMin, 0.005, z), V3(xMax, 0.005, z)]), new THREE.LineBasicMaterial({ color })); root.add(l); };
  edge(0, COL.green); edge(-lz, COL.green); edge(o.zB, COL.blue); edge(o.zB + aw, COL.blue);
  label(V3(xMin + 0.9, 0.5, -lz - 0.45), '組立ライン（車体の流れ →）', '');
  label(V3(xMin + 1.1, 0.02, -lz / 2), 'ライン側：人の作業域', 'zone human');
  label(V3(xMin + 1.1, 0.02, o.zB + aw / 2), '通路側：MoMa走行帯', 'zone moma');
  dimLine(root, V3(xMax - 0.5, 0.01, o.zB), V3(xMax - 0.5, 0.01, o.zB + aw), `通路幅 ${C.moma.aisleTurn}mm（仮・旋回に必要な幅）`, V3(1, 0, 0));
  AREA = { xMin, xMax, lz, aw, zB: o.zB };
  return { xMin, xMax, lz, aw };
}
function pickBand(root, x0, x1, z) {
  const y0 = M(C.shooter.pickHmin), y1 = M(C.shooter.pickHmax);
  const p = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, y1 - y0), new THREE.MeshBasicMaterial({ color: COL.green, transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false }));
  p.position.set((x0 + x1) / 2, (y0 + y1) / 2, z - 0.05); root.add(p);
  for (const y of [y0, y1]) root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([V3(x0, y, z - 0.05), V3(x1, y, z - 0.05)]), new THREE.LineBasicMaterial({ color: COL.green })));
  dimLine(root, V3(x0 - 0.12, y0, z - 0.05), V3(x0 - 0.12, y1, z - 0.05), `人の取り出し域<br>${C.shooter.pickHmin}〜${C.shooter.pickHmax}mm（仮）`);
}
function stopMark(root, x, zC, face = false) {   // face：棚に向いて止まる（車体の前後が棚の奥行きの向き）
  const L = M(face ? C.moma.baseW : C.moma.baseL), W = M(face ? C.moma.baseL : C.moma.baseW);
  rectLine(root, x - L / 2 - 0.03, x + L / 2 + 0.03, zC - W / 2 - 0.03, zC + W / 2 + 0.03, COL.blue, true);
  for (const sx of [-1, 1]) addBox(root, 0.1, 0.004, 0.1, COL.retro, x + sx * (L / 2 + 0.08), 0.003, zC - W / 2 - 0.08);
}

/* ===================== LexxMoMa R1（説明資料の外観を再現。寸法は資料と図から） ===================== */
function roundedBox(w, h, d, r, material) {
  const s = new THREE.Shape(), x = w / 2, z = d / 2;
  s.moveTo(-x + r, -z); s.lineTo(x - r, -z); s.quadraticCurveTo(x, -z, x, -z + r); s.lineTo(x, z - r); s.quadraticCurveTo(x, z, x - r, z);
  s.lineTo(-x + r, z); s.quadraticCurveTo(-x, z, -x, z - r); s.lineTo(-x, -z + r); s.quadraticCurveTo(-x, -z, -x + r, -z);
  const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false, curveSegments: 6 });
  g.rotateX(-Math.PI / 2);   // 押し出し方向を上（+y）へ
  return mesh(g, material);
}
function makeMoMa(o) {
  const P = C.moma, L = M(P.baseL), W = M(P.baseW), Hc = M(P.chassisH), Hb = M(P.bodyH), bx = o.box;
  const L1 = M(P.upper), L2 = M(P.fore), tl = M(P.wrist + P.gripLen);
  const g = new THREE.Group();
  const frame = mat('#a7adb3', { metalness: 0.35, roughness: 0.45 }), frameD = mat('#6e757c', { metalness: 0.3 }), cab = mat('#a3a8c2', { roughness: 0.55 });
  const door = mat('#c9ccd6'), dark = mat('#23292f'), white = mat('#eceeef', { roughness: 0.4 }), green = mat('#2fb24c', { roughness: 0.4 }), orange = mat('#d9822b', { metalness: 0.3, roughness: 0.4 });
  const clear = new THREE.MeshStandardMaterial({ color: '#dfe7ee', transparent: true, opacity: 0.55, roughness: 0.15 });
  // 走行台車：枠・キャスター・駆動輪・前後のブラケット
  addBox(g, L, 0.05, W, frame, 0, Hc - 0.025, 0);
  addBox(g, L - 0.06, 0.09, W - 0.12, frameD, 0, Hc - 0.095, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const cw = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.045, 18), clear); cw.rotation.x = Math.PI / 2; cw.position.set(sx * (L / 2 - 0.08), 0.05, sz * (W / 2 - 0.05)); g.add(cw);
    addBox(g, 0.05, 0.06, 0.05, frameD, sx * (L / 2 - 0.08), 0.11, sz * (W / 2 - 0.05));
  }
  const wheels = [];
  for (const sz of [-1, 1]) {
    const dw = mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.05, 24), orange); dw.rotation.x = Math.PI / 2; dw.position.set(0, 0.085, sz * (W / 2 - 0.03)); g.add(dw); wheels.push(dw);
    const hub = mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.055, 16), dark); hub.rotation.x = Math.PI / 2; hub.position.copy(dw.position); g.add(hub);
  }
  for (const sx of [-1, 1]) { addBox(g, 0.012, 0.11, 0.24, frame, sx * (L / 2 + 0.006), Hc - 0.07, 0); addBox(g, 0.006, 0.03, 0.12, dark, sx * (L / 2 + 0.013), Hc - 0.07, 0); }
  // キャビネット（角を丸めた箱）＋天板
  const cw = L - 0.04, cd = W - 0.04, ch = Hb - Hc - 0.012;
  const body = roundedBox(cw, ch, cd, 0.035, cab); body.position.y = Hc; g.add(body);
  const lid = roundedBox(cw + 0.008, 0.012, cd + 0.008, 0.038, mat('#b4b8cf')); lid.position.y = Hb - 0.012; g.add(lid);
  // 前面（+x）の制御盤の扉：表示灯6つ（右端は緑）と取っ手
  addBox(g, 0.006, ch * 0.78, cd * 0.82, door, cw / 2 + 0.003, Hc + ch * 0.45, 0);
  for (let i = 0; i < 6; i++) { const lp = mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.01, 12), i === 5 ? green : dark); lp.rotation.z = Math.PI / 2; lp.position.set(cw / 2 + 0.008, Hc + ch * 0.74, -0.09 + i * 0.035); g.add(lp); }
  addBox(g, 0.012, 0.11, 0.03, dark, cw / 2 + 0.009, Hc + ch * 0.45, cd * 0.33);
  // 側面（+z・通路側）の収納口：前後250×高さ450
  const sL = M(P.storage.L), sH = M(P.storage.H);
  addBox(g, sL, sH, 0.006, mat('#3b4048'), -cw / 2 + 0.06 + sL / 2, Hc + 0.04 + sH / 2, cd / 2 + 0.002);
  addBox(g, sL - 0.03, sH - 0.03, 0.004, mat('#5d6470'), -cw / 2 + 0.06 + sL / 2, Hc + 0.04 + sH / 2, cd / 2 + 0.004);
  const npm = texMat(['LexxMoMa'], { bg: '#a3a8c2', fg: '#ffffff', font: 40, w: 256, h: 64 });
  plane(g, 0.3, 0.075, npm, 0.15, Hb - 0.08, cd / 2 + 0.002); plane(g, 0.3, 0.075, npm, -0.1, Hb - 0.08, -cd / 2 - 0.002, Math.PI);
  const stM = new THREE.MeshStandardMaterial({ color: '#8fdcff', emissive: '#2fa8ff', emissiveIntensity: 0.8 });
  for (const sz of [-1, 1]) addBox(g, L * 0.6, 0.014, 0.006, stM, 0, Hc + 0.02, sz * (cd / 2 + 0.004));
  // 箱は天面の前側に載せる（仕様書の図）。TP箱は段積みできるので上へ重ねる（段数は仮）
  // 天面の箱置き：アームの横（車体の右、+z）に、箱の長い向きを車体の前後（x）にそろえて置く。
  // 棚に向き直ったとき（90°旋回）箱の長い向きが棚の奥行きの向きになり、端面の取っ手穴に手先（棚の方向）で爪を掛けられる
  const ax = M(P.armX) - M(P.deckBack), deckZ = M(P.deckGap) + bx.x / 2, slots = [];   // ax：箱置きの前後の中心（アームの軸から少し後ろ）
  const ds = M(P.deckStand), dw = bx.x;
  addBox(g, bx.z + 0.03, 0.012, dw, mat('#5d6470'), ax, Hb + ds - 0.006, deckZ);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) addBox(g, 0.02, ds - 0.012, 0.02, mat('#5d6470'), ax + sx * (bx.z / 2), Hb + (ds - 0.012) / 2, deckZ + sz * (dw / 2 - 0.01));
  for (let t = P.maxBoxes - 1; t >= 0; t--) slots.push(V3(ax, Hb + ds + bx.y / 2 + 0.001 + t * (bx.y - 0.008), deckZ));
  // 進入禁止域（車体まわり）を金色の枠で表示
  { const k = M(P.keepOut), kb = new THREE.Box3(V3(-L / 2 - k, 0, -W / 2 - k), V3(L / 2 + k, Hb + k, W / 2 + k)); const kh = new THREE.Box3Helper(kb, 0xc9a227); kh.material.transparent = true; kh.material.opacity = 0.8; g.add(kh); DIMS.push(kh); }
  // アーム（FANUC CRX-20iA/L 風：白い丸みのあるリンク、緑の帯、黒い付け根）。取付は天面の中央
  const root = new THREE.Group(); root.position.set(M(P.armX), Hb, 0); g.add(root);
  const cyl = (r, h, m, axis) => { const c = mesh(new THREE.CylinderGeometry(r, r, h, 28), m); if (axis === 'z') c.rotation.x = Math.PI / 2; if (axis === 'x') c.rotation.z = Math.PI / 2; return c; };
  const base = cyl(0.1, 0.06, dark); base.position.y = 0.03; root.add(base);
  const yaw = new THREE.Group(); root.add(yaw);
  const j1 = cyl(0.085, 0.13, white); j1.position.y = 0.125; yaw.add(j1);
  const r1 = cyl(0.087, 0.025, green); r1.position.y = 0.085; yaw.add(r1);
  const sh = new THREE.Group(); sh.position.y = M(P.j2H); yaw.add(sh);
  const j2 = cyl(0.085, 0.17, white, 'z'); j2.position.z = 0.03; sh.add(j2);
  const j2r = cyl(0.087, 0.022, green, 'z'); j2r.position.z = 0.115; sh.add(j2r);
  const up = cyl(0.062, L1, white, 'x'); up.position.set(L1 / 2, 0, 0.1); sh.add(up);
  const upr = cyl(0.064, 0.03, green, 'x'); upr.position.set(L1 * 0.78, 0, 0.1); sh.add(upr);
  const el = new THREE.Group(); el.position.x = L1; sh.add(el);
  const j3 = cyl(0.072, 0.2, white, 'z'); j3.position.z = 0.06; el.add(j3);
  const fo = cyl(0.05, L2, white, 'x'); fo.position.set(L2 / 2, 0, -0.01); el.add(fo);
  const fr = cyl(0.052, 0.028, green, 'x'); fr.position.set(0.12, 0, -0.01); el.add(fr);
  const wpg = new THREE.Group(); wpg.position.x = L2; el.add(wpg);
  const j5 = cyl(0.055, 0.13, white, 'z'); wpg.add(j5);
  const wy = new THREE.Group(); wpg.add(wy);
  const tg = new THREE.Group(); wy.add(tg);
  const j6 = cyl(0.048, M(P.wrist) - 0.03, white, 'x'); j6.position.x = (M(P.wrist) - 0.03) / 2; tg.add(j6);
  const j6r = cyl(0.05, 0.022, green, 'x'); j6r.position.x = M(P.wrist) - 0.06; tg.add(j6r);
  const fl = cyl(0.042, 0.03, dark, 'x'); fl.position.x = M(P.wrist) - 0.015; tg.add(fl);
  addBox(tg, M(P.gripLen) - 0.04, 0.07, 0.08, mat('#56636e'), M(P.wrist) + (M(P.gripLen) - 0.04) / 2, 0, 0);
  addBox(tg, 0.05, 0.035, 0.05, '#111', M(P.wrist) + 0.04, 0.06, 0);
  const cam = new THREE.Object3D(); cam.position.set(M(P.wrist) + 0.07, 0.06, 0); tg.add(cam);
  // フック式ハンド：端面に当てる板と、取っ手穴（箱の上端から40mm下）に掛ける爪2本
  // 爪の板は取っ手穴（箱の上端から40mm下）のまわりだけ：穴の35mm下〜25mm上。手首の軸は箱の中心の高さ
  const fingers = [], hookY = bx.y / 2 - 0.04, plateW = bx.x * 0.62;
  addBox(tg, 0.012, 0.06, plateW, mat('#56636e'), tl - 0.006, hookY - 0.005, 0);
  for (const s of [-1, 1]) fingers.push(addBox(tg, 0.03, 0.016, 0.035, COL.blue, tl + 0.012, hookY, s * 0.03));
  const tcp = new THREE.Object3D(); tcp.position.x = tl; tg.add(tcp);
  const ring = dashedRing(root, M(P.armReach), COL.blue); ring.position.y = M(P.j2H);
  let lastP = V3(), lastH = 0;
  const m = {
    g, slots, tcp, cam, tool: tg, elbow: el, status: stM, L1, L2,
    shoulderW() { root.updateWorldMatrix(true, false); return root.localToWorld(V3(0, M(P.j2H), 0)); },
    ik(w) {
      root.updateWorldMatrix(true, false); const wl = root.worldToLocal(w.clone()), hd = g.rotation.y;   // 車体の向きに対する角度で解く
      const dx = wl.x, dz = wl.z; let dy = wl.y - M(P.j2H), r = Math.hypot(dx, dz), d = Math.hypot(r, dy), ok = true;
      const max = L1 + L2 - 1e-4; if (d > max) { ok = false; r *= max / d; dy *= max / d; d = max; }
      const psi = Math.atan2(-dz, dx), a2 = Math.acos(clamp((d * d - L1 * L1 - L2 * L2) / (2 * L1 * L2), -1, 1));
      const a1 = Math.atan2(dy, r) + Math.atan2(L2 * Math.sin(a2), L1 + L2 * Math.cos(a2));
      yaw.rotation.y = psi; sh.rotation.z = a1; el.rotation.z = -a2; wpg.rotation.z = -(a1 - a2); wy.rotation.y = Math.PI / 2 - psi - hd;   // 手先は車体の向きによらず -z（棚）
      return ok;
    },
    homeW() { root.updateWorldMatrix(true, false); return root.localToWorld(V3(0, M(P.j2H) + 0.35, -0.15)); },
    homeAt(p, h = g.rotation.y) { const r = V3(M(P.armX), Hb + M(P.j2H) + 0.35, -0.15); return V3(p.x + r.x * Math.cos(h) + r.z * Math.sin(h), r.y, p.z - r.x * Math.sin(h) + r.z * Math.cos(h)); },   // 台車が p にいるときの走行姿勢の手首   // 走行姿勢：天面の箱と反対の横（-z）向き。上腕の付け根が箱から離れる向き
    joints() {   // 干渉の計算に使う点（ワールド座標）。上腕は肩の横に 0.1m ずれている（形のとおり）
      g.updateWorldMatrix(true, true);
      return { u0: sh.localToWorld(V3(0, 0, 0.1)), u1: sh.localToWorld(V3(L1, 0, 0.1)), el: el.getWorldPosition(V3()), w: wpg.getWorldPosition(V3()),
        fl: tg.localToWorld(V3(M(P.wrist), 0, 0)), tcp: tcp.getWorldPosition(V3()) };
    },
    plateBox() { const t = tcp.getWorldPosition(V3()); return { x0: t.x - plateW / 2, x1: t.x + plateW / 2, y0: t.y + hookY - 0.035, y1: t.y + hookY + 0.025, z0: t.z - 0.001, z1: t.z + 0.012 }; },
    gripBox() { const t = tcp.getWorldPosition(V3()), f = tg.localToWorld(V3(M(P.wrist), 0, 0)); return { x0: t.x - 0.04, x1: t.x + 0.04, y0: t.y - 0.035, y1: t.y + 0.035, z0: Math.min(t.z, f.z), z1: Math.max(t.z, f.z) }; },
    ignore: new Set(),
    bodyBox(k = 0) { const p = g.position, q = Math.abs(Math.sin(g.rotation.y)) > 0.5, hx = (q ? W : L) / 2, hz = (q ? L : W) / 2; return { x0: p.x - hx - k, x1: p.x + hx + k, y0: -1, y1: Hb + k, z0: p.z - hz - k, z1: p.z + hz + k }; },   // 0°・90°のときのワールドの箱（表示・確認用）
    bodyLocal(k = 0) { return { x0: -L / 2 - k, x1: L / 2 + k, y0: -1, y1: Hb + k, z0: -W / 2 - k, z1: W / 2 + k }; },   // 車体の座標での箱（干渉の計算）
    toLocal(p) { g.updateWorldMatrix(true, false); return g.worldToLocal(p.clone()); },
    heading: 0,
    deckBoxes() { return g.children.filter(o => o.userData && (o.userData.kind === 'box') && o !== this.held && !this.ignore.has(o)); },
    held: null,
    wristFor(c, bz = bx.z) { return c.clone().add(V3(0, 0, tl + bz / 2)); },   // 手先は常に -z（棚の方向）を向く
    setFingers(open) { fingers.forEach(f => f.position.y = hookY - 0.02 * open); },   // 爪を上げて取っ手穴に掛ける
    spin() { const p = g.position, h = g.rotation.y, f = (p.x - lastP.x) * Math.cos(h) - (p.z - lastP.z) * Math.sin(h), dh = h - lastH;   // 前進分と旋回分で左右の車輪を回す
      lastP = p.clone(); lastH = h; wheels.forEach((w, i) => { const side = i === 0 ? -1 : 1; w.rotation.y -= (f - side * dh * (W / 2 - 0.03)) / 0.085; }); },
    setStatus(c) { stM.color.set(c); stM.emissive.set(c); },
    fill(objs) { objs.forEach((b, i) => { g.add(b); b.position.copy(slots[i]); b.rotation.set(0, Math.PI / 2, 0); }); },
    camW() { return cam.getWorldPosition(V3()); },
  };
  m.curWrist = m.homeW(); m.ik(m.curWrist); m.setFingers(1);
  return m;
}
function momaZ(zB) { return zB + M(C.moma.clearance) + M(C.moma.baseW) / 2; }
const ARM_X = () => M(C.moma.armX);   // 車体中心からアームの取付位置まで（後ろが負）

/* ===================== 作業者（簡易人形） ===================== */
function makeWorker(o = {}) {
  const g = new THREE.Group(), vest = mat(o.color || COL.green), pants = mat('#44525c'), skin = mat('#efd9c6');
  for (const sx of [-1, 1]) addBox(g, 0.13, 0.84, 0.15, pants, sx * 0.085, 0.42, 0);
  addBox(g, 0.4, 0.58, 0.23, vest, 0, 1.13, 0);
  addBox(g, 0.41, 0.06, 0.24, mat('#f2f5f7'), 0, 1.0, 0);
  const hd = mesh(new THREE.SphereGeometry(0.105, 16, 12), skin); hd.position.y = 1.54; g.add(hd);
  const hm = mesh(new THREE.SphereGeometry(0.12, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(o.helmet || '#ffffff')); hm.position.y = 1.56; g.add(hm);
  const arms = [];
  for (const sx of [-1, 1]) {
    const s = new THREE.Group(); s.position.set(sx * 0.25, 1.36, 0); g.add(s);
    addBox(s, 0.09, 0.3, 0.1, vest, 0, -0.15, 0);
    const e = new THREE.Group(); e.position.y = -0.3; s.add(e); addBox(e, 0.08, 0.28, 0.09, skin, 0, -0.14, 0);
    arms.push({ s, e });
  }
  const hold = new THREE.Object3D(); hold.position.set(0, 1.05, 0.42); g.add(hold);
  g.scale.setScalar(C.worker.height / 1700);
  return { g, hold, carry: null,
    setPose(k) { for (const a of arms) { a.s.rotation.x = -k * 1.25; a.e.rotation.x = -k * 0.35; } },
    holdW() { return hold.getWorldPosition(V3()); } };
}

/* ===================== 動作の手順（簡易アニメーション） ===================== */
let WARN = new Set();
function warn(t) { if (!WARN.has(t)) { WARN.add(t); renderWarns(); } }
const A = {
  call(fn, label, dur = 0.9, who) { return { label, dur, who, start: fn }; },
  wait(label, dur = 1, who) { return { label, dur, who }; },
  drive(m, toX, dur, label) { let fx; return { label, dur, start() { fx = m.g.position.x; }, update(k) { m.g.position.x = lerp(fx, toX, k); m.curWrist = m.homeW(); m.ik(m.curWrist); m.spin(); collide(m, label); } }; },
  arm(m, toFn, dur, label) { let from, to; return { label, dur, start() { from = m.curWrist.clone(); to = toFn(); }, update(k) { const w = from.clone().lerp(to, k); m.curWrist = w; if (!m.ik(w)) warn(`アームのリーチ不足：「${label}」（CONFIG の値で届かない位置があります）`); collide(m, label); } }; },
  // 肩のまわりを回って運ぶ：手首を肩から rMin 以上離し、棚の側（-z）を回る（箱が肩の上を通らない）。高さは直線で変える
  // back：手だけのとき、車体の後ろ（+z）側を回る（天面に2段の箱があり、棚の方へ向けられないとき）。zMin：手首のzの下限（持った箱・手先を棚の面より手前に保つ）
  arc(m, toFn, dur, label, o = {}) { let s, f, t, a0, a1, r0, r1; const rMin = o.rMin ?? 0.6;
    const ang = v => { let a = Math.atan2(v.z, v.x); if (o.back) { if (a < -Math.PI / 2) a += 2 * Math.PI; } else if (a > Math.PI / 2) a -= 2 * Math.PI; return a; };
    return { label, dur, start() { s = m.shoulderW(); f = m.curWrist.clone().sub(s); t = toFn().sub(s); a0 = ang(f); a1 = ang(t); r0 = Math.hypot(f.x, f.z); r1 = Math.hypot(t.x, t.z); },
      update(k) { const a = lerp(a0, a1, k), r = lerp(r0, r1, k) + Math.max(0, rMin - Math.min(r0, r1)) * Math.sin(Math.PI * k);
        const w = s.clone().add(V3(r * Math.cos(a), lerp(f.y, t.y, k), r * Math.sin(a))); if (o.zMin) w.z = Math.max(w.z, o.zMin()); m.curWrist = w;
        if (!m.ik(w)) warn(`アームのリーチ不足：「${label}」`); collide(m, label); } }; },
  // 手と足のシンクロ動作：台車（前進・後退・旋回）とアームを同時に動かす。手首は車体に対する位置を、台車と同じ進み方で目標へ変える。
  // 台車と手首がどちらも直線なら、手首（持った箱）は世界でも直線を動く（棚から箱をまっすぐ引き出せる）
  sync(m, baseFn, wristFn, dur, label, o = {}) { let p0, p1, h0, h1, r0, r1;
    const toRel = (w, p, h) => { const d = w.clone().sub(p); return V3(d.x * Math.cos(h) - d.z * Math.sin(h), d.y, d.x * Math.sin(h) + d.z * Math.cos(h)); };
    const fromRel = (r, p, h) => V3(p.x + r.x * Math.cos(h) + r.z * Math.sin(h), p.y + r.y, p.z - r.x * Math.sin(h) + r.z * Math.cos(h));
    return { label, dur, start() { p0 = m.g.position.clone(); h0 = m.g.rotation.y; const b = baseFn(); p1 = V3(b.x, 0, b.z); h1 = o.heading ?? h0;
        r0 = toRel(m.curWrist, p0, h0); r1 = toRel(wristFn(p1), p1, h1); },
      update(k) { const p = p0.clone().lerp(p1, k), h = lerp(h0, h1, k); m.g.position.copy(p); m.g.rotation.y = h; m.g.updateMatrixWorld(true);
        const kr = clamp((k - (o.armFrom || 0)) / ((o.armTo ?? 1) - (o.armFrom || 0)), 0, 1);
        const w = fromRel(r0.clone().lerp(r1, kr), p, h); m.curWrist = w; if (!m.ik(w)) warn(`アームのリーチ不足：「${label}」`); m.spin(); o.onUpd && o.onUpd(k); collide(m, label); } }; },
  // その場で旋回（2輪駆動：左右の車輪を逆に回す）。アームは走行姿勢のまま
  turn(m, toH, dur, label) { let fh; return { label, dur, start() { fh = m.g.rotation.y; }, update(k) { m.g.rotation.y = lerp(fh, toH, k); m.g.updateMatrixWorld(true); m.curWrist = m.homeW(); m.ik(m.curWrist); m.spin(); collide(m, label); } }; },
  // 前進・後退（アームの姿勢は車体に対してそのまま）。2輪駆動なので、車体の向きに沿ってだけ動かす。箱の引き出し・押し込みに使う
  base(m, toFn, dur, label, onUpd) { let from, off; return { label, dur, start() { from = m.g.position.clone(); off = m.curWrist.clone().sub(from); },
    update(k) { const t = toFn(); m.g.position.set(lerp(from.x, t.x, k), 0, lerp(from.z, t.z, k)); m.curWrist = m.g.position.clone().add(off); m.ik(m.curWrist); m.spin(); onUpd && onUpd(k); collide(m, label); } }; },
  grip(m, box, label = 'フックを取っ手穴に掛ける') { return { label, dur: 0.4, update(k) { m.setFingers(1 - k); }, end() { m.tcp.attach(box); m.held = box; } }; },
  release(m, box, onRel, label = '箱を離す') { return { label, dur: 0.4, start() { m.held = null; onRel(box); }, update(k) { m.setFingers(k); } }; },
  advance(lane, dur, label, who) {
    let from; return { label, dur, who, start() { from = lane.q.map(b => b.userData.s); },
      update(k) { lane.q.forEach((b, i) => { const s = lerp(from[i], lane.sAt(i), k); b.userData.s = s; b.position.copy(lane.posS(s)); b.rotation.set(lane.rx, 0, 0); }); }, end() { lane.onChange && lane.onChange(); } };
  },
  tween(obj, toFn, dur, label, o = {}) { let from; return { label, dur, who: o.who, start() { from = obj.position.clone(); o.start && o.start(); }, update(k) { obj.position.lerpVectors(from, toFn(), k); o.update && o.update(k); }, end: o.end }; },
  par(label, dur, steps, who) { return { label, dur, who, start() { steps.forEach(s => s.start && s.start()); }, update(k) { steps.forEach(s => s.update && s.update(k)); }, end() { steps.forEach(s => s.end && s.end()); } }; },
  beam(fromFn, toFn, dur, label, flash, flashAt, who) {
    let b, L; return { label, dur, who, start() { b = makeBeam(who === 'human' ? COL.green : COL.blue); if (flash) L = label_(flashAt(), flash, 'flash' + (who === 'human' ? ' human' : '')); },
      update(k) { setBeam(b, fromFn(), toFn()); b.material.opacity = 0.35 + 0.6 * Math.abs(Math.sin(k * Math.PI * 3)); },
      end() { b.parent.remove(b); b.geometry.dispose(); unlabel(L); } };
  },
};
const label_ = (...a) => label(...a);
/* ===================== 干渉の確認（アーム・ハンド・持った箱 ↔ 車体＋進入禁止域・天面の箱・床・棚） ===================== */
// 棚は「間口の空間（slot）」の中にだけ、ハンドと持った箱が入ってよい。アームのリンクは棚に入ってはいけない。
let VERIFY = { hits: [], total: Infinity, frames: 0, ms: 0, stances: [] };   // 干渉の確認（右パネル用）は省く
const COLL = { ctx: null, step: -1, si: -1, stepMin: Infinity, total: Infinity, hits: [] };
const aabbC = (c, d) => ({ x0: c.x - d.x / 2, x1: c.x + d.x / 2, y0: c.y - d.y / 2, y1: c.y + d.y / 2, z0: c.z - d.z / 2, z1: c.z + d.z / 2 });
const aabbOf = o => { const cs = cornersOf(o), b = { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9, z0: 1e9, z1: -1e9 };   // 向きも含めたワールドの外形
  for (const p of cs) { b.x0 = Math.min(b.x0, p.x); b.x1 = Math.max(b.x1, p.x); b.y0 = Math.min(b.y0, p.y); b.y1 = Math.max(b.y1, p.y); b.z0 = Math.min(b.z0, p.z); b.z1 = Math.max(b.z1, p.z); } return b; };
const aabbPts = cs => { const b = { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9, z0: 1e9, z1: -1e9 }; for (const p of cs) { b.x0 = Math.min(b.x0, p.x); b.x1 = Math.max(b.x1, p.x); b.y0 = Math.min(b.y0, p.y); b.y1 = Math.max(b.y1, p.y); b.z0 = Math.min(b.z0, p.z); b.z1 = Math.max(b.z1, p.z); } return b; };
const grow = (b, k) => ({ x0: b.x0 - k, x1: b.x1 + k, y0: b.y0 - k, y1: b.y1 + k, z0: b.z0 - k, z1: b.z1 + k });
function ptBox(p, b) { const dx = Math.max(b.x0 - p.x, 0, p.x - b.x1), dy = Math.max(b.y0 - p.y, 0, p.y - b.y1), dz = Math.max(b.z0 - p.z, 0, p.z - b.z1); return Math.hypot(dx, dy, dz); }
function segBox(a, c, b, n = 18) { let d = 1e9; for (let i = 0; i <= n; i++) { const t = i / n; d = Math.min(d, ptBox({ x: a.x + (c.x - a.x) * t, y: a.y + (c.y - a.y) * t, z: a.z + (c.z - a.z) * t }, b)); } return d; }
function boxBox(a, b) {   // 2つの箱のすき間（重なれば負）
  const gx = Math.max(a.x0 - b.x1, b.x0 - a.x1), gy = Math.max(a.y0 - b.y1, b.y0 - a.y1), gz = Math.max(a.z0 - b.z1, b.z0 - a.z1);
  if (gx < 0 && gy < 0 && gz < 0) return Math.max(gx, gy, gz);
  return Math.hypot(Math.max(gx, 0), Math.max(gy, 0), Math.max(gz, 0));
}
// 間口の空間：前後方向に傾いた下面（置き面）と上面（上の段の下側）。z＝ライン側0 → 通路側D
function slotY(sl, z) { const t = clamp((z - sl.zA) / (sl.zB - sl.zA), 0, 1); return [lerp(sl.loA, sl.loB, t), lerp(sl.hiA, sl.hiB, t)]; }
function ptInSlot(p, sl, t) { if (p.x < sl.x0 - t || p.x > sl.x1 + t || p.z < sl.z0 - t || p.z > sl.z1 + t) return false; const [lo, hi] = slotY(sl, p.z); return p.y >= lo - t && p.y <= hi + t; }
const inRack = (p, r) => p.x > r.x0 && p.x < r.x1 && p.y > r.y0 && p.y < r.y1 && p.z > r.z0 && p.z < r.z1;
function cornersOf(h) {   // 持った箱の8つの角（向きも含めて）
  const out = [];
  if (h.bb) { const b = h.bb; for (const x of [b.x0, b.x1]) for (const y of [b.y0, b.y1]) for (const z of [b.z0, b.z1]) out.push(V3(x, y, z)); return out; }
  const d = h.userData.dim; h.updateWorldMatrix(true, false);
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) out.push(V3(x * d.x / 2, y * d.y / 2, z * d.z / 2).applyMatrix4(h.matrixWorld));
  return out;
}
function checkMoMa(m, held) {   // held: 持っている箱（Object3D）か { bb } か null
  const ctx = COLL.ctx; if (!ctx) return { min: Infinity, hit: null };
  const K = M(C.moma.keepOut), R = C.moma.linkR.map(M), body = m.bodyLocal(K), L_ = p => m.toLocal(p), inBody = b => aabbPts(cornersOf({ bb: b }).map(L_)), floor = { x0: -1e3, x1: 1e3, y0: -1e3, y1: 0.05, z0: -1e3, z1: 1e3 };
  const deckObjs = m.deckBoxes().filter(b => b !== held), deckRaw = deckObjs.map(aabbOf), rackK = grow(ctx.rack, 0.03);
  const deckL = deckObjs.map(b => aabbPts(cornersOf(b).map(p => m.toLocal(p)))), decks = deckL.map(b => grow(b, 0.005));   // 天面の箱は車体の座標で計算（旋回中も正しく）
  const J = m.joints(); let min = Infinity, hit = null;
  let minWhat = '';
  const test = (d, what) => { if (d < min) { min = d; minWhat = what; } if (d < -0.0005 && !hit) hit = what; };
  { const bl = m.bodyLocal(0), cs = []; for (const x of [bl.x0, bl.x1]) for (const z of [bl.z0, bl.z1]) cs.push(m.g.localToWorld(V3(x, bl.y1, z)));   // 車体（と天面の箱）が棚に当たらない（旋回中も）
    test(boxBox(aabbPts(cs.concat(cs.map(p => p.clone().setY(0)))), ctx.rack) - 0.03, '車体が棚'); deckRaw.forEach(d => test(boxBox(d, ctx.rack) - 0.03, '天面の箱が棚')); }
  for (const [a, c, r, n] of [[J.u0, J.u1, R[0], '上腕'], [J.el, J.w, R[1], '前腕'], [J.w, J.fl, R[2], '手首']]) {
    test(segBox(L_(a), L_(c), body) - r, `${n}が車体の進入禁止域`); test(segBox(a, c, floor) - r, `${n}が床`); test(segBox(a, c, rackK) - r, `${n}が棚`);
    decks.forEach(d => test(segBox(L_(a), L_(c), d) - r, `${n}が天面の箱`));
  }
  for (const [hb, n] of [[m.gripBox(), 'ハンドの胴'], [m.plateBox(), '爪の板']]) {   // ハンド：棚に入るのは間口の空間の中だけ
    const hl = inBody(hb); test(boxBox(hl, body), `${n}が車体の進入禁止域`); decks.forEach(d => test(boxBox(hl, d), `${n}が天面の箱`)); test(hb.y0 - 0.05, `${n}が床`);
    const inside = cornersOf({ bb: hb }).filter(p => inRack(p, ctx.rack));
    if (inside.length && !ctx.slots.some(sl => inside.every(p => ptInSlot(p, sl, 0.003)))) test(-0.001, `${n}が棚`);
  }
  if (held) {
    const bb = held.bb || aabbOf(held);
    // 持った箱は天面の箱置きに置くので、進入禁止域ではなく車体そのものと10mm以上離す。積んだTP箱は8mm入り込む
    test(segBox(J.u0, J.u1, bb) - R[0], '上腕が持った箱'); test(segBox(J.el, J.w, bb) - R[1], '前腕が持った箱');
    test(boxBox(held.bb ? inBody(bb) : aabbPts(cornersOf(held).map(L_)), m.bodyLocal(0.01)), '箱が車体'); { const hl = held.bb ? inBody(bb) : aabbPts(cornersOf(held).map(L_)); deckL.forEach(d => test(boxBox(hl, d) + 0.009, '箱が天面の箱')); } test(bb.y0 - 0.0, '箱が床');
    const inside = cornersOf(held).filter(p => inRack(p, ctx.rack));   // 棚の中にある角は、どれか1つの間口の空間に収まること
    if (inside.length && !ctx.slots.some(sl => inside.every(p => ptInSlot(p, sl, 0.003)))) test(-0.001, '箱が棚');
  }
  return { min, hit, minWhat };
}
function collide(m, label) {
  const r = checkMoMa(m, m.held);
  if (COLL.step !== COLL.si) { COLL.step = COLL.si; COLL.stepMin = Infinity; }
  if (r.min < COLL.stepMin) COLL.stepWhat = r.minWhat; if (r.min < COLL.total) COLL.totalWhat = r.minWhat + '（' + label + '）';
  COLL.stepMin = Math.min(COLL.stepMin, r.min); COLL.total = Math.min(COLL.total, r.min);
  if (r.hit && !COLL.hits.some(h => h.si === COLL.si)) { COLL.hits.push({ si: COLL.si, label, hit: r.hit, min: r.min, at: COLL.dbg ? COLL.dbg(m) : null }); warn(`干渉：「${label}」で${r.hit}`); }
  const el = document.getElementById('clr');
  if (el) { el.textContent = `アーム・ハンド・箱と、車体（進入禁止域${C.moma.keepOut}mm）・棚・床の最小すき間：この手順 ${Math.round(COLL.stepMin * 1000)}mm`; el.style.color = COLL.stepMin < 0 ? '#b02a2a' : '#1f6b42'; }
}

/* ===================== 箱を扱う動き（フック式ハンド・箱は常に水平・手先は棚の方向） ===================== */
const endFace = (c, dim) => c.clone().add(V3(0, 0, dim.z / 2));
function pathTo(m, toFn, label, ys, dur = 1.2) {   // 上がる → 横へ → 下がる（ys：移動するときの手首の高さ）
  return [
    A.arm(m, () => { const c = m.curWrist; return V3(c.x, Math.max(c.y, ys), c.z); }, dur * 0.5, label),
    A.arm(m, () => { const t = toFn(); return V3(t.x, Math.max(t.y, ys), t.z); }, dur, label),
    A.arm(m, toFn, dur * 0.6, label),
  ];
}
function hookOn(m, box, cFn, label) {   // 端面の取っ手穴に爪を掛ける：手前下から近づき、当てて、爪を上げる
  const d = box.userData.dim;
  return [
    A.arm(m, () => m.wristFor(cFn().add(V3(0, -0.01, 0.06)), d.z), 0.7, label),
    A.arm(m, () => m.wristFor(cFn().add(V3(0, -0.01, 0)), d.z), 0.5, label),
    A.arm(m, () => m.wristFor(cFn(), d.z), 0.35, label),
    A.grip(m, box),
  ];
}
function hookOff(m, label, dz = 0.07) {   // 爪を下げて抜き、手前へ戻す
  return [A.arm(m, () => m.curWrist.clone().add(V3(0, -0.01, 0)), 0.3, label), A.arm(m, () => m.curWrist.clone().add(V3(0, 0, dz)), 0.5, label)];
}
// 棚の間口の、箱を置く位置（箱の中心）と、引き出し・押し込みに必要な台車の前後の移動量
function laneSpot(lane, s) { return lane.wpos(s); }
function preInsertDelta(c, dim, D) { return (D + 0.02 + dim.z / 2) - c.z; }   // 箱の奥の端が棚の面から 20mm 出る位置まで
// 停止位置の探索：その間口で箱を持った姿勢（置いた位置・持ち上げた位置・引き出した位置）が、どれも当たらない停止位置
// 停止位置の探索：MoMaは2輪駆動で横に動けないので、棚に向き直って（90°旋回）止まり、前進・後退で出し入れする。
// cs：同じ停止位置（左右の位置と棚からの距離が同じ）で扱う間口の箱の中心。どの間口でも、箱を置いた・持ち上げた・引き出した姿勢と爪を掛けに行く姿勢が当たらないこと
const FACE = Math.PI / 2;   // 棚に向いた車体の向き（車体の前＝棚）
function findStance(m, cs, dim, D, liftY, absent = []) {   // absent：そのときには天面にない箱
  const save = { p: m.g.position.clone(), h: m.g.rotation.y, w: m.curWrist.clone() }; absent.forEach(b => m.ignore.add(b)); m.g.rotation.y = FACE;
  const near = M(C.moma.clearance + C.moma.baseL / 2), dels = cs.map(c => preInsertDelta(c, dim, D));
  let best = null;
  for (const dx of [0, 0.15, 0.3, 0.4, 0.45, 0.5, 0.55, 0.6, 0.625, 0.65, 0.675, 0.7, 0.75, 0.8, 0.9])
    for (const sg of [1, -1]) for (const F of [near, near + 0.05, near + 0.1]) {
      if (dx === 0 && sg < 0) continue;
      let worst = Infinity, ok = true;
      cs.forEach((c, ci) => { if (!ok) return; const del = dels[ci];
        // 箱を持った姿勢（置いた・持ち上げた・引き出した）と、持たずに爪を掛けに行く姿勢（当てる前・当てた・台車が下がった）
        for (const [dz, dy, hold, hz] of [[0, 0.012, 1, 0], [0, liftY, 1, 0], [del, liftY, 1, 0], [0, -0.01, 0, 0.06], [0, -0.01, 0, 0], [del, -0.01, 0, 0.06]]) {
          m.g.position.set(cs[0].x + sg * dx, 0, D + F + dz);
          const cc = c.clone().add(V3(0, dy, dz)), w = m.wristFor(cc.clone().add(V3(0, 0, hz)), dim.z);
          if (!m.ik(w)) { ok = false; break; }
          const r = checkMoMa(m, hold ? { bb: aabbC(cc, dim) } : null); if (r.hit) { ok = false; break; } worst = Math.min(worst, r.min);
        } });
      if (ok && worst >= 0.005 && (!best || (dx < best.adx - 1e-9) || (Math.abs(dx - best.adx) < 1e-9 && worst > best.min + 0.005))) best = { dx: sg * dx, adx: dx, F, min: worst, dels };
      if (best && dx > best.adx) break;
    }
  m.g.position.copy(save.p); m.g.rotation.y = save.h; m.curWrist = save.w; m.ik(save.w); m.ignore.clear();
  return best;
}
// 置き先：レーン／台車／任意の位置
const toLane = (lane, sFn) => box => { lane.parent.attach(box); const s = sFn ? sFn() : lane.entryS; box.userData.s = s; box.position.copy(lane.posS(s)); box.rotation.set(lane.rx, 0, 0); lane.q.push(box); };
const toDeck = (m, i) => box => { m.g.attach(box); box.position.copy(m.slots[i]); box.rotation.set(0, Math.PI / 2, 0); };
const toSpot = (parent, p) => box => { parent.attach(box); box.position.copy(p); box.rotation.set(0, 0, 0); };
// アームで箱を A→B へ移す一連の動き
function transfer(m, box, fromFn, toFn, onRel, o = {}) {
  const out = o.fromOut || V3(0, 0.11, 0), app = o.toApp || V3(0, 0.03, 0.26), bz = box.userData.dim.z;
  const W = f => () => m.wristFor(f(), bz);
  const add = (f, v) => () => f().add(v);
  return [
    A.arm(m, W(add(fromFn, V3(0, out.y * 0.4, 0.16))), o.t0 || 1.0, o.l0 || '手先を箱へ寄せる'),
    A.arm(m, W(fromFn), 0.5, o.l0 || '手先を箱へ寄せる'),
    Object.assign(A.grip(m, box, o.lg), o.fromLane ? { end() { m.tcp.attach(box); const q = o.fromLane.q, i = q.indexOf(box); if (i >= 0) q.splice(i, 1); } } : {}),
    A.arm(m, W(add(fromFn, out)), 0.55, o.l1 || '箱を持ち上げる'),
    ...(o.via ? [A.arm(m, () => m.wristFor(o.via(), bz), 0.9, o.l2 || '置き先の手前へ運ぶ')] : []),
    A.arm(m, W(add(toFn, app)), o.t2 || 1.3, o.l2 || '置き先の手前へ運ぶ'),
    A.arm(m, W(toFn), 0.7, o.l3 || '定位置へ置く'),
    A.release(m, box, onRel, o.lr),
    A.arm(m, W(add(toFn, V3(0, 0.03, 0.24))), 0.5, o.l4 || '手先を戻す'),
  ];
}
function scan(m, targetFn, label, flash = '読取OK') {
  return [A.arm(m, () => targetFn().add(V3(-0.1, 0.2, 0.45)), 1.0, label),
    A.beam(() => m.camW(), targetFn, 1.1, label, flash, () => targetFn().add(V3(0, 0.09, 0)))];
}
function verify(m, boxFn, label, flash) { return [A.beam(() => m.camW(), () => wp(boxFn(), V3(0, -0.03, boxFn().userData.dim.z / 2)), 1.3, label, flash, () => wp(boxFn(), V3(0, 0.2, 0)))]; }
// 作業者：先頭の箱を取り出す → 手元に持つ
function workerPick(W, lane, label) {
  let box, from, r0;
  return [
    { label, who: 'human', dur: 0.8, update(k) { W.setPose(k); } },
    { label, who: 'human', dur: 0.9, start() { box = lane.q.shift(); ROOT.attach(box); from = box.position.clone(); r0 = box.rotation.x; },
      update(k) { box.position.lerpVectors(from, W.holdW(), k); box.rotation.set(lerp(r0, 0, k), 0, 0); W.setPose(1 - 0.45 * k); },
      end() { W.hold.attach(box); W.carry = box; lane.onChange && lane.onChange(); } },
  ];
}
// 作業者：持っている箱をレーンの入口（または指定位置）へ置く
function workerPlace(W, lane, label, pose = 1.1, sFn) {
  let box, from;
  return [
    { label, who: 'human', dur: 1.1, start() { box = W.carry; ROOT.attach(box); from = box.position.clone(); },
      update(k) { const s = sFn ? sFn() : lane.entryS; box.position.lerpVectors(from, lane.wpos(s), k); box.rotation.set(lerp(0, lane.rx, k), 0, 0); W.setPose(0.55 + (pose - 0.55) * Math.sin(k * Math.PI / 2)); },
      end() { toLane(lane, sFn)(box); W.carry = null; } },
    { label, who: 'human', dur: 0.5, update(k) { W.setPose(pose * (1 - k)); } },
  ];
}
class Timeline {
  constructor(steps) { this.steps = steps; this.i = 0; this.t = 0; }
  get done() { return this.i >= this.steps.length; }
  update(dt) {
    while (this.i < this.steps.length) {
      const s = this.steps[this.i];
      if (!s._st) { s._st = true; COLL.si = this.i; s.start && s.start(); setCaption(this.i + 1, this.steps.length, s.label, s.who); }
      this.t += dt; dt = 0;
      const k = Math.min(1, this.t / (s.dur || 1e-4));
      s.update && s.update(ease(k), k);
      if (k < 1) return;
      s.end && s.end(); this.i++; this.t = 0;
    }
  }
}

/* ===================== 画面（タブ・右パネル・比較表） ===================== */
const $ = s => document.querySelector(s);

function setCaption() { }   // 字幕は出さない
function renderWarns() { const el = $('#warns'); if (el) el.innerHTML = [...WARN].map(w => `<div>⚠ ${w}</div>`).join(''); }
const sec = (t, items, cls = '') => `<h3 class="${cls}">${t}</h3><ul>${items.map(x => `<li>${typeof x === 'function' ? x() : x}</li>`).join('')}</ul>`;

/* ===================== 本案：縦型・高さ活用型（CAD cad/shooter-space と同じ規則で段を積む） ===================== */
const tpDim = t => { const d = C.tp.types[t]; return { x: M(d.W), y: M(d.H), z: M(d.L) }; };
const S_OF = () => { const s = C.plan.slopePct / 100; return { pick: s, return: -s, returnf: 0, reserve: -s }; };
const isRet = k => k.startsWith('return');
const momaCenterMax = () => REACH.hi;                                   // reach.py の計算結果
const momaCenterMin = () => Math.max(C.plan.momaCenterMin, REACH.lo);
function standoffFor(zc) {   // 箱の中心の高さ zc で出し入れできる、棚の面から肩までの距離の最小（mm）
  let best = null;
  for (const [z, f0] of REACH.rows) if (Math.abs(z - zc) <= 12.5) best = best == null ? f0 : Math.max(best, f0);
  if (best == null) { const r = REACH.rows.reduce((a, b) => Math.abs(b[0] - zc) < Math.abs(a[0] - zc) ? b : a); best = r[1]; }
  return best;
}
function stackLv(rows, D, z0) {
  const P = C.plan, H = C.tp.types[P.mainType].H, S = S_OF(), out = [];
  for (const kinds of rows) {
    let zf;
    if (!out.length) zf = z0 != null ? z0 : P.floorMin;
    else {
      const lo = out[out.length - 1]; zf = -1e9;
      kinds.forEach((ku, i) => { const kl = lo.kinds[i], [gf, gb] = P.gap[kl];
        zf = Math.max(zf, lo.zf + H + gf + P.structBelow, lo.zf + S[kl] * D + H + gb + P.structBelow - S[ku] * D); });
    }
    if (kinds.some(k => k === 'pick' || isRet(k))) zf = Math.max(zf, C.shooter.pickHmin);
    out.push({ kinds: [...kinds], zf });
  }
  return out;
}
const lvZ = (l, k, y) => l.zf + S_OF()[k] * y;
function design(spec) {
  const P = C.plan, t = C.tp.types[P.mainType], H = t.H, S = S_OF(), cols = spec.cols;
  const D = P.stopOff + spec.deep * t.L + (spec.deep - 1) * C.box.gap + P.rearClear, cmax = momaCenterMax();
  const band = []; for (let z = C.shooter.pickHmin; z + H <= C.shooter.pickHmax; z += H + P.gap.pick[0] + P.structBelow) band.push(z);
  const rowsBand = band.map((_, i) => spec.retMode === 'column' ? [...Array(cols - 1).fill('pick'), i === 0 ? 'pick' : 'returnf'] : Array(cols).fill('pick'));
  if (spec.retMode === 'top') rowsBand.push(Array(cols).fill('return'));
  const zb0 = Math.max(P.floorMin, momaCenterMin() - H / 2), zf0 = zb0 - S.reserve * D, R = () => Array(cols).fill('reserve');
  let nLow = 0;
  if (spec.low == null) { for (let n = 1; n < 8; n++) { const lv = stackLv([...Array(n)].map(R).concat(rowsBand), D, zf0); if (lv[n].zf > C.shooter.pickHmin + 0.01) break; nLow = n; } }
  else nLow = spec.low;
  let rows = [...Array(nLow)].map(R).concat(rowsBand), nHigh = 0;
  const z0 = nLow ? zf0 : null;
  while (spec.high == null || nHigh < spec.high) {
    const tr = stackLv(rows.concat([...Array(nHigh + 1)].map(R)), D, z0), top = tr[tr.length - 1];
    const topBox = Math.max(...tr.flatMap(l => l.kinds.map(k => Math.max(lvZ(l, k, 0), lvZ(l, k, D))))) + H;
    if (top.zf + S.reserve * D + H / 2 + P.hookLift > cmax || topBox + 60 > P.rackMaxH) break;   // 持ち上げた分も届くこと
    nHigh++;
  }
  rows = rows.concat([...Array(nHigh)].map(R));
  const lv = stackLv(rows, D, z0);
  const pitch = t.W + 2 * P.sideClear + P.pipeD, width = cols * pitch + P.pipeD;
  const closed = lv.some(l => l.kinds.includes('reserve')), depth = D + (closed ? P.panel : 0);
  const height = Math.max(...lv.flatMap(l => l.kinds.map(k => Math.max(lvZ(l, k, 0), lvZ(l, k, D))))) + H + 60;
  const cap = tn => Math.floor((D - P.stopOff - 20 + C.box.gap) / (C.tp.types[tn].L + C.box.gap));
  const lanes = []; let sku = 0;
  lv.forEach((l, li) => l.kinds.forEach((k, c) => { const tn = k === 'pick' ? ((spec.mix || {})[`${c}-${li}`] || P.mainType) : P.mainType;
    lanes.push({ li, c, kind: k, type: tn, cap: cap(tn), sku: k === 'pick' ? sku++ : null }); }));
  const pick = lanes.filter(x => x.kind === 'pick'), res = lanes.filter(x => x.kind === 'reserve'), ret = lanes.filter(x => isRet(x.kind));
  const capacity = [...pick, ...res].reduce((a, x) => a + x.cap, 0), area = width * depth / 1e6, boxVol = t.L * t.W * t.H / 1e9;
  const centers = lanes.filter(x => !isRet(x.kind)).map(x => lvZ(lv[x.li], x.kind, D) + H / 2);
  return { spec, D, lv, lanes, pitch, width, depth, height, sku, capacity, area, H, nLow, nHigh, nBand: band.length,
    areaAisle: width * (depth + C.moma.aisleTurn) / 1e6, perM2: capacity / area, volEff: capacity * boxVol / (width * depth * height / 1e9),
    retLine: Math.max(0, ...ret.map(x => lv[x.li].zf)), pickTop: Math.max(...pick.map(x => lv[x.li].zf)) + H,
    momaRange: [Math.min(...centers), Math.max(...centers)], cmax, retLanes: ret.length };
}
const mainSpec = () => ({ cols: C.plan.cols, deep: C.plan.deep, retMode: 'top', mix: C.plan.mix });
// 予備在庫段をどの品番に割り当てるか：同じ列の中で、下の予備は下の取り出し段から順に、上の予備は上の取り出し段から順に
function reserveMap(Lo) {
  const map = {}, levels = Lo.lv.map((l, li) => ({ li, k: l.kinds[0] }));
  const picks = levels.filter(x => x.k === 'pick').map(x => x.li), lows = levels.filter(x => x.k === 'reserve' && x.li < picks[0]).map(x => x.li);
  const highs = levels.filter(x => x.k === 'reserve' && x.li > picks[picks.length - 1]).map(x => x.li);
  lows.forEach((li, i) => map[li] = picks[Math.min(i, picks.length - 1)]);
  highs.forEach((li, j) => map[li] = picks[Math.max(0, picks.length - 1 - j)]);
  return map;   // 予備段の段番号 → 取り出し段の段番号（列は同じ）
}
function momaLabels(m, toolText) {
  label(m.g, `LexxMoMa R1：W${C.moma.baseW}×D${C.moma.baseL}×H${C.moma.bodyH}mm（アームを除く）`, 'moma', V3(0.1, M(C.moma.bodyH) - 0.2, M(C.moma.baseW) / 2));
  label(m.tool, toolText, 'moma', V3(0.08, 0.1, 0));
  label(m.elbow, `${C.moma.arm}（車体の中心）・可搬${C.moma.payloadKg}kg`, 'moma', V3(0, 0.07, 0));
  label(m.g, `天面の箱置き（${C.moma.maxBoxes}段積み・仮）`, 'moma', V3(m.slots[0].x, m.slots[0].y + 0.15, 0.2));
}
const stopLabel = (root, x, z) => label(V3(x, 0.01, z + M(C.moma.baseW) / 2 + 0.12), 'MoMa停止位置（床の目印）', 'moma');
const skuCode = (c, li) => `${'ABCDEFGH'[c]}-${li + 1}0${c + 1}`;
const SKU_COLORS = ['#2F6FB3', '#C2577F', '#E8A33D', '#8C6BB1', '#3C9A9B', '#A67C52', '#5A7FBF', '#D9644A', '#6E8F3A', '#B5479A', '#4D8BC9', '#C98A2B'];
function buildMain(root) {
  const P = C.plan, Lo = design(mainSpec()), base = design(P.compare[0]), rmap = reserveMap(Lo);
  const D = M(Lo.D), pitch = M(Lo.pitch), laneW = M(Lo.pitch - P.pipeD), H = M(Lo.height), main = tpDim(P.mainType);
  env(root, { zB: D });
  const x0 = -M(Lo.width - P.pipeD) / 2, xs = [...Array(P.cols + 1)].map((_, i) => x0 + i * pitch), xc = c => x0 + pitch * (c + 0.5);
  const lanes = {}, key = (li, c) => `${li}-${c}`;
  const skuOfLane = (li, c) => { const pl = Lo.lv[li].kinds[c] === 'pick' ? li : rmap[li]; return Lo.lanes.find(x => x.li === pl && x.c === c); };
  const colorOf = (li, c) => { const s = skuOfLane(li, c); return s.type !== P.mainType ? COL.tp[s.type] : SKU_COLORS[s.sku % SKU_COLORS.length]; };
  const tc = 0, liP = Lo.lv.findIndex(l => l.kinds[0] === 'pick');
  const demoRes = +Object.keys(rmap).find(li => rmap[li] === liP);   // 例に使う予備段（最下段の取り出し段の予備）
  for (const x of Lo.lanes) {
    const l = Lo.lv[x.li], k = x.kind, bx = tpDim(x.type), zf = M(l.zf), zb = M(lvZ(l, k, Lo.D));
    let lane;
    if (k === 'reserve' || k === 'return') {   // 通路側（低い方）が出口
      lane = makeLane(root, { x: xc(x.c), w: laneW, zF: D, yF: zb, zB: 0, yB: zf, type: 'roller', box: bx, stopOff: 0.03, railColor: k === 'reserve' ? shade(COL.retro, 0.2) : COL.frame });
      addBox(root, laneW, M(P.exitStopH), 0.014, '#6f7c86', xc(x.c), zb + M(P.exitStopH) / 2, D - 0.008);
      if (k === 'reserve') {
        addBox(root, laneW, 0.04, 0.014, '#6f7c86', xc(x.c), zf + 0.02, 0.008);
        const s = skuOfLane(x.li, x.c), n = (x.li === demoRes && x.c === tc) ? 1 : x.cap;
        for (let i = 0; i < n; i++) putOnLane(lane, makeBox(bx, { color: colorOf(x.li, x.c), code: skuCode(x.c, s.li) }), i);
        plane(root, 0.16, 0.05, texMat([`予備 ${skuCode(x.c, s.li)}`], { bg: colorOf(x.li, x.c), fg: '#fff', w: 192, h: 60, font: 26 }), xc(x.c), zb - 0.03, D + 0.02);
      }
    } else if (k === 'returnf') {
      lane = makeLane(root, { x: xc(x.c), w: laneW, zF: 0, yF: zf, zB: D, yB: zb + 1e-6, type: 'flat', box: bx, plateColor: '#e3eaef' });
    } else {
      lane = makeLane(root, { x: xc(x.c), w: laneW, zF: 0, yF: zf, zB: D, yB: zb, type: 'roller', box: bx, stopOff: M(P.stopOff) });
      addBox(root, laneW, 0.04, 0.014, '#6f7c86', xc(x.c), zf + 0.02, 0.008);
      for (let i = 0; i < x.cap; i++) putOnLane(lane, makeBox(bx, { color: colorOf(x.li, x.c), code: skuCode(x.c, x.li) }), i);
    }
    lanes[key(x.li, x.c)] = lane;
  }
  posts(root, xs, [0, D], H);
  const pan = new THREE.MeshStandardMaterial({ color: '#dfe7ee', transparent: true, opacity: 0.5, roughness: 0.3 });
  const pk1 = Lo.lv[liP], liR = Lo.lv.findIndex(l => isRet(l.kinds[0]));
  const lowTop = M(pk1.zf - P.structBelow - 10), highBot = M(Lo.lv[liR].zf + Lo.H + 30);
  if (Lo.nLow) addBox(root, M(Lo.width), lowTop - 0.06, M(P.panel), pan, 0, 0.06 + (lowTop - 0.06) / 2, -M(P.panel) / 2);
  if (Lo.nHigh) addBox(root, M(Lo.width), H - highBot, M(P.panel), pan, 0, highBot + (H - highBot) / 2, -M(P.panel) / 2);
  const mkZ = lowTop - 0.04, mk = [];
  for (const x of [xs[0], xs[xs.length - 1]]) { addBox(root, 0.1, 0.1, 0.01, mat(COL.retro), x, mkZ, D + 0.03); mk.push(makeMarker(root, x, mkZ, D + 0.036, 0.08, mk.length + 71)); }
  pickBand(root, M(-Lo.width / 2), M(Lo.width / 2), 0);
  const bw = M(base.width), bd = M(base.depth);
  rectLine(root, -M(Lo.width) / 2, M(Lo.width) / 2, -M(P.panel), D, COL.blue, false);
  rectLine(root, -bw / 2, bw / 2, 0, bd, '#8a99a5', true);
  label(V3(bw / 2 - 0.1, 0.01, bd - 0.05), `A 従来型（${base.capacity}箱）の床 ${base.area.toFixed(2)}m²`, '');
  label(V3(-M(Lo.width) / 2 + 0.2, 0.01, D * 0.5), `本案の床 ${Lo.area.toFixed(2)}m²・${Lo.capacity}箱（${f1(Lo.perM2)}箱/m²）`, 'moma');
  const L = (li, c) => lanes[key(li, c)], last = P.cols - 1;
  label(L(0, last).posS(0.4).add(V3(0, 0.12, 0)), `足元の予備在庫（MoMa専用・押し込み式・${Lo.nLow}段）`, 'moma');
  label(L(Lo.lv.length - 1, last).posS(0.4).add(V3(0, 0.12, 0)), `頭上の予備在庫（MoMa専用・${Lo.nHigh}段）`, 'moma');
  label(L(liR, last).posS(0.5).add(V3(0, 0.12, 0)), `空箱返却段（人の作業域のすぐ上・ライン側 ${Math.round(Lo.lv[liR].zf)}mm）`, 'human');
  label(L(liP + 1, last).posS(0.35).add(V3(0, 0.12, 0)), `取り出し段：傾斜ローラー${P.slopePct}%・奥${P.deep}箱`);
  label(V3(M(Lo.width) / 2 - 0.2, lowTop / 2, -0.02), 'ライン側は閉じ板', 'human');
  label(mk[1], '棚マーカー（左右2枚）', 'retro', V3(0, 0.07, 0));
  label(V3(xc(1), M(lvZ(Lo.lv[0], 'reserve', Lo.D)) - 0.06, D + 0.04), '色＝品番。予備在庫は同じ列の取り出し段と同じ色', 'retro');
  dimLine(root, V3(-M(Lo.width) / 2 - 0.3, 0.01, 0), V3(-M(Lo.width) / 2 - 0.3, 0.01, D), `奥行き ${Math.round(Lo.D)}mm`, V3(1, 0, 0));
  dimLine(root, V3(-M(Lo.width) / 2, H + 0.08, 0), V3(M(Lo.width) / 2, H + 0.08, 0), `棚幅 ${Math.round(Lo.width)}mm（${P.cols}列・${Lo.sku}品番）`);
  dimLine(root, V3(M(Lo.width) / 2 + 0.16, 0, 0), V3(M(Lo.width) / 2 + 0.16, M(C.shooter.pickHmax), 0), `人の作業域 〜${C.shooter.pickHmax}mm`);
  dimLine(root, V3(M(Lo.width) / 2 + 0.16, 0, D), V3(M(Lo.width) / 2 + 0.16, H, D), `高さ ${Math.round(Lo.height)}mm`);
  dimLine(root, V3(M(Lo.width) / 2 + 0.36, M(Lo.momaRange[0]), D), V3(M(Lo.width) / 2 + 0.36, M(Lo.momaRange[1]), D), `MoMaが扱う箱の中心 ${Math.round(Lo.momaRange[0])}〜${Math.round(Lo.momaRange[1])}mm`);
  if (C.tp.fullKg > C.moma.payloadKg) warn(`部品入りTP箱 ${C.tp.fullKg}kg がアームの可搬 ${C.moma.payloadKg}kg を超えています`);
  // 人・MoMa
  const W0 = makeWorker(); W0.g.position.set(xc(tc), 0, -0.42); root.add(W0.g);
  label(W0.g, '作業者（取り出しは1500mm以下、空箱はすぐ上の返却段へ）', 'human', V3(0, 1.85, 0));
  const m = makeMoMa({ box: main }), zNear = D + M(C.moma.clearance + C.moma.baseL / 2);
  const sP1 = skuOfLane(liP, tc), deck = [0, 1].slice(0, C.moma.maxBoxes).map(() => makeBox(main, { color: colorOf(liP, tc), code: skuCode(tc, sP1.li) }));
  m.g.position.set(xc(tc), 0, zNear); root.add(m.g);
  m.fill(deck); m.ik(m.homeW()); momaLabels(m, 'フック式ハンド（取っ手穴に爪を掛けて端面で持つ・仮）＋手先カメラ');
  window.__momaTarget = () => m.tcp.getWorldPosition(V3()).add(V3(0, -0.1, 0.1));
  // 干渉の確認に使う棚の形：外形と、各間口の空間（箱とハンドが入ってよい範囲。置き面と上の段の下側は傾いている）
  COLL.ctx = { rack: { x0: -M(Lo.width) / 2, x1: M(Lo.width) / 2, y0: 0, y1: H, z0: -M(P.panel), z1: D }, slots: Lo.lanes.map(x => {
    const l = Lo.lv[x.li], up = Lo.lv[x.li + 1], k = x.kind, ku = up && up.kinds[x.c];
    return { x0: xc(x.c) - laneW / 2, x1: xc(x.c) + laneW / 2, z0: -0.01, z1: D + 0.05, zA: 0, zB: D,
      loA: M(lvZ(l, k, 0)) - 0.002, loB: M(lvZ(l, k, Lo.D)) - 0.002, hiA: up ? M(lvZ(up, ku, 0) - P.structBelow) : H, hiB: up ? M(lvZ(up, ku, Lo.D) - P.structBelow) : H };
  }) };
  COLL.hits = []; COLL.total = Infinity; COLL.step = '';
  // 使う間口：足元の予備→取り出し段1、頭上の予備→取り出し段2、返却段の出口
  const T = L(liP, tc), T2 = L(liP + 1, tc), R = L(liR, tc), RV = L(demoRes, tc);
  const liHV = +Object.keys(rmap).find(li => +li > liR && rmap[li] === liP + 1), HV = L(liHV, tc);
  const lift = M(P.hookLift), bz = main.z, Wr = c => m.wristFor(c, bz);
  const PULL = { low: M(C.moma.syncPull.low), high: M(C.moma.syncPull.high), ret: M(C.moma.syncPull.ret) };
  // 停止位置：棚に向いて止まり、同じ停止位置で扱う間口をまとめる（左右の位置と棚からの距離が同じ。間口ごとに前後の移動量だけ違う）
  const group = (items, absent = [], pull = 0) => {   // pull：出し入れの前後の移動のうち、腕が受け持つ量（シンクロ動作）
    const cs = items.map(([lane, s]) => lane.wpos(s)), st = findStance(m, cs, main, D, lift, absent);
    if (!st) warn(`停止位置が見つからない：${items.map(i => i[2]).join('・')}`);
    const g0 = st || { dx: 0, F: M(C.moma.clearance + C.moma.baseL / 2), dels: cs.map(() => 0.6) };
    return items.map(([, , name], i) => ({ x: cs[0].x + g0.dx, zN: D + g0.F, zR: D + g0.F + g0.dels[i], zT: D + g0.F + Math.max(...g0.dels), del: g0.dels[i], pull: Math.min(pull, g0.dels[i]), dx: g0.dx, F: g0.F, name, zc: cs[i].y * 1000 }));
  };
  const [stLR, stP1] = group([[RV, RV.sAt(0), '足元の予備'], [T, T.entryS, '取り出し段1']], [], PULL.low);
  const [stHV, stP2] = group([[HV, HV.sAt(0), '頭上の予備'], [T2, T2.entryS, '取り出し段2']], deck, PULL.high);   // 高い段のときは天面は空
  const [stRet] = group([[R, R.sAt(0), '返却段の出口']], [deck[0]], PULL.ret);   // 空箱の2箱目のときは天面に1箱
  window.__stances = [stLR, stP1, stHV, stP2, stRet]; window.__dbg = { m, RV, T, T2, HV, R, D, main, lift, deck };
  stopMark(root, stLR.x, stLR.zN, true); stopLabel(root, stLR.x, stLR.zN); stopMark(root, stHV.x, stHV.zN, true);
  label(V3(stLR.x, 0.01, stLR.zN - M(C.moma.baseL) / 2 - 0.05), `低い段：列の正面から${Math.round(Math.abs(stLR.dx) * 1000)}mm横で、棚に向いて停止`, 'moma');
  const stTxt = st => `${Math.abs(st.dx) > 0.01 ? `列の正面から${Math.round(Math.abs(st.dx) * 1000)}mm横` : '列の正面'}・棚から${Math.round((st.F - M(C.moma.baseL) / 2) * 1000)}mm`;
  // 前進・後退（棚に向いているので、2輪駆動のまま棚の奥行きの向きに動ける）
  const goBase = (st, near, label, onUpd) => A.base(m, () => V3(st.x, 0, near ? st.zN : st.zR), 1.2, label, onUpd);
  const baseTo = (st, label) => A.base(m, () => V3(st.x, 0, st.zR), 0.8, label);   // 同じ停止位置の中で、前後の位置だけ合わせる
  // 別の停止位置へ：走行姿勢 → 下がる → 90°旋回して通路の向きへ → 通路に沿って走る → 90°旋回して棚に向き直る
  const travel = (from, to, label) => [
    A.sync(m, () => V3(from.x, 0, Math.max(from.zT, to.zT)), p => riseAt(p, yTr), 1.3, '後退しながら、手先を肩より上へ上げる（シンクロ）'),
    A.arc(m, () => m.homeW(), 1.0, '手先を走行姿勢に戻す', { back: true, zMin: zOut }),
    A.turn(m, 0, 1.4, 'その場で90°旋回して通路の向きへ（2輪駆動は横に動けない）'),
    A.drive(m, to.x, 1.6, label),
    A.turn(m, FACE, 1.4, 'その場で90°旋回して棚に向き直る'),
  ];
  // 持ち上げながら箱を水平に戻す（レーンの傾きのまま掴むため）
  const liftLevel = (toFn, label) => { const a = A.arm(m, toFn, 0.5, label), s0 = a.start, u0 = a.update; let q0, q1;
    a.start = () => { s0(); const b = m.held; q0 = b.quaternion.clone(); q1 = m.tcp.getWorldQuaternion(new THREE.Quaternion()).invert(); };
    a.update = k => { m.held.quaternion.copy(q0).slerp(q1, k); u0(k); }; return a; };
  let c0 = V3();   // 掴んだときの箱の中心（持ち上げる量の基準）
  const gripFrom = (box, lane) => Object.assign(A.grip(m, box), { end() { c0 = wp(box); m.tcp.attach(box); m.held = box; const i = lane ? lane.q.indexOf(box) : -1; if (i >= 0) lane.q.splice(i, 1); } });
  const unhook = () => [A.arm(m, () => m.curWrist.clone().add(V3(0, -0.01, 0)), 0.3, '爪を下げて取っ手穴から抜く'), A.arm(m, () => m.curWrist.clone().add(V3(0, 0, 0.06)), 0.4, '手先を少し戻す')];
  // 間口から取り出す（シンクロ）：台車の前後の位置合わせと同時に手先を間口の正面へ → 前進しながら腕を伸ばして手先を間口へ
  // → 爪を掛けて持ち上げる → 後退しながら腕を引き寄せ、箱をまっすぐ引き出す。前後の移動量 del を台車（del−pull）と腕（pull）で分ける
  const zA = st => st.zN + st.del - st.pull;   // 箱が棚の外に出たときの台車の位置
  const takeFrom = (box, lane, st, what, via = []) => {
    const c = () => wp(box);
    return [
      ...via,
      A.sync(m, () => V3(st.x, 0, zA(st)), () => Wr(c().add(V3(0, -0.01, st.del + 0.06))), 1.2, `${what}へ：台車の前後の位置合わせと同時に、手先を間口の正面へ`),
      A.sync(m, () => V3(st.x, 0, st.zN), () => Wr(c().add(V3(0, -0.01, 0.06))), 0.9, st.pull ? `前進しながら腕を伸ばし、手先を間口に入れる（${stTxt(st)}）` : `前進：手先を間口に入れる（${stTxt(st)}）`),
      A.arm(m, () => Wr(c().add(V3(0, -0.01, 0))), 0.5, '端面に当てる'),
      A.arm(m, () => Wr(c()), 0.35, '爪を上げて取っ手穴に掛ける'),
      gripFrom(box, lane),
      liftLevel(() => Wr(c0.clone().add(V3(0, lift, 0))), `出口ストッパーを越える高さへ持ち上げる（${P.hookLift}mm）`),
      A.sync(m, () => V3(st.x, 0, zA(st)), () => Wr(c0.clone().add(V3(0, lift, st.del))), 0.9, st.pull ? `後退しながら腕を引き寄せ、箱をまっすぐ引き出す（台車${Math.round((st.del - st.pull) * 1000)}mm＋腕${Math.round(st.pull * 1000)}mm）` : '後退して箱を引き出す（アームは止めたまま）'),
    ];
  };
  // 間口へ入れる（シンクロ）：台車の位置合わせと同時に箱を間口の正面へ → 前進しながら腕を伸ばして入れる（押し込み式は前の箱を奥へ押す）
  // → 下ろす → 爪を抜く → 後退しながら腕を引く
  const putTo = (box, lane, st, sFn, what, onRel, via = [], push = false) => {
    const c = () => lane.wpos(sFn()); let q0;
    const pushUpd = push ? () => {   // 持った箱のレーン上の位置から、先に入れた箱を奥へ押す
      const hz = wp(box).z, hs = (hz - lane.o.zF) / ((lane.o.zB - lane.o.zF) / lane.L);
      lane.q.forEach((b, i) => { b.userData.s = Math.max(q0[i], hs + (i + 1) * lane.pitch); b.position.copy(lane.posS(b.userData.s)); }); } : null;
    const how = st.pull ? '前進しながら腕を伸ばし、' : '前進：';
    const fwd = A.sync(m, () => V3(st.x, 0, st.zN), () => Wr(c().add(V3(0, lift, 0))), 0.9, push ? `${how}箱を入れながら、先に入れた箱を奥へ押し込む（${stTxt(st)}）` : `${how}箱を間口に入れる（${stTxt(st)}）`, { onUpd: pushUpd });
    if (push) onStart(fwd, () => { q0 = lane.q.map(b => b.userData.s); });
    return [
      ...via,
      A.sync(m, () => V3(st.x, 0, zA(st)), () => Wr(c().add(V3(0, lift, st.del))), 1.3, `${what}の正面へ運ぶ（台車の前後の位置合わせと同時）`),
      fwd,
      A.arm(m, () => Wr(c().add(V3(0, 0.012, 0))), 0.5, '置き面へ下ろす'),
      A.release(m, box, onRel, '箱を離す'),
      ...unhook(),
      A.sync(m, () => V3(st.x, 0, zA(st)), () => m.curWrist.clone().add(V3(0, 0, st.del)), 0.8, st.pull ? '後退しながら腕を引く' : '後退する'),
    ];
  };
  const toLaneFront = lane => box => { lane.parent.attach(box); box.userData.s = lane.sAt(0); box.position.copy(lane.posS(box.userData.s)); box.rotation.set(lane.rx, 0, 0); lane.q.unshift(box); };
  // 天面の箱：手前（+z）の端面に爪を掛け、真上へ持ち上げる（下の箱・車体の進入禁止域に当たらない高さ）
  // 天面の上を通るときの高さ：いま天面にある箱の上端から、手だけなら爪の板の下端・胴の下端が、箱を持つなら箱の底が15mm上
  const stackTop = () => Math.max(M(C.moma.bodyH + C.moma.keepOut), ...m.deckBoxes().map(b => aabbOf(b).y1));
  const ysOver = () => stackTop() + (m.held ? 0.03 + main.y / 2 : 0.05);
  const up = (y, label, dur = 0.7) => A.arm(m, () => { const w = m.curWrist.clone(); w.y = Math.max(w.y, typeof y === 'function' ? y() : y); return w; }, dur, label);
  // 天面と棚のあいだで箱を運ぶときの中継点：天面の箱の位置の真横で、肩より棚側（上腕・前腕が箱の上を通らない）
  const yTr = M(C.moma.bodyH + C.moma.j2H) + 0.4;   // 箱を持って肩の前を回るときの高さ
  const zOut = () => D + 0.03 + M(C.moma.wrist + C.moma.gripLen) + (m.held ? bz : 0);   // 手首のzの下限：持った箱・手先が棚の面より30mm手前
  // 台車が p まで動いたとき、手首は車体に対して同じ位置のまま高さだけ y に（setY：y に合わせる／既定は y より低ければ上げる）
  const riseAt = (p, y, setY = false) => { const w = m.curWrist.clone().add(p.clone().sub(m.g.position)); w.y = setY ? y : Math.max(w.y, y); return w; };
  const onStart = (st, fn) => { const s0 = st.start; st.start = () => { fn(); s0 && s0(); }; return st; };
  const deckTake = (i, what, st) => { const box = deck[i], c = () => wp(box);
    return [
      A.sync(m, () => V3(st.x, 0, st.zT), p => riseAt(p, ysOver()), 1.0, '後退しながら、手先を天面の高さより上へ（シンクロ）'),
      A.arc(m, () => Wr(c().add(V3(0, -0.01, 0.06))).setY(Math.max(ysOver(), c().y)), 1.5, `${what}の上へ（天面に2段あるときは車体の後ろ側を回す）`, { back: m.deckBoxes().length > 1, zMin: zOut }),
      A.arm(m, () => Wr(c().add(V3(0, -0.01, 0.06))), 0.6, '端面の手前へ下ろす'),
      onStart(A.arm(m, () => Wr(c().add(V3(0, -0.01, 0))), 0.4, '端面に当てる'), () => m.ignore.add(box)),   // 掴む箱そのものは障害物から外す
      A.arm(m, () => Wr(c()), 0.35, '爪を上げて取っ手穴に掛ける'),
      onStart(gripFrom(box, null), () => m.ignore.delete(box)),
      A.arm(m, () => Wr(c0).setY(ysOver()), 0.7, '真上へ持ち上げる（下の箱と車体に当たらない高さ）'),
    ]; };
  const deckPut = (i, box, what, st) => { const c = () => wp(m.g, m.slots[i]);
    return [
      A.sync(m, () => V3(st.x, 0, st.zT), p => riseAt(p, yTr, true), 1.2, '後退しながら、箱を肩より少し上の高さにそろえる（シンクロ・ひじが箱の上に来ないように）'),
      A.arc(m, () => Wr(c()).setY(yTr), 1.8, `肩のまわりを棚の側から回して${what}の上へ（箱は肩の上を通らない）`, { zMin: zOut }),
      A.arm(m, () => Wr(c().add(V3(0, 0.004, 0))), 0.8, '天面に下ろす'),
      A.release(m, box, b => { toDeck(m, i)(b); m.ignore.add(b); }, '箱を離す'),   // 離した箱は、爪を抜くまで障害物から外す
      ...unhook(),
      onStart(up(ysOver, '手先を上へ逃がす', 0.5), () => m.ignore.delete(box)),
    ]; };
  const down = (yFn, label) => A.arm(m, () => { const w = m.curWrist.clone(); w.y = yFn(); return w; }, 0.9, label);
  const empty1 = T.q[0], empty2 = T2.q[0], rb = RV.q[0], hb = HV.q[0];
  m.g.rotation.y = Math.PI; m.g.position.set(stLR.x + 4.3, 0, stLR.zT); m.curWrist = m.homeW(); m.ik(m.curWrist);
  const steps = [
    A.call(() => { m.g.rotation.y = Math.PI; m.g.position.set(stLR.x + 4.3, 0, stLR.zT); }, '消費連動：空箱の信号を受けてMoMaが出発', 0.6),
    A.drive(m, stLR.x, 3.0, `MoMaが通路を走り、担当列の${Math.round(Math.abs(stLR.dx) * 1000)}mm横で止まる`),
    A.turn(m, FACE, 1.4, 'その場で90°旋回して棚に向き直る（2輪駆動なので、棚へは前進・後退で近づく）'),
    A.call(() => empty1.userData.setEmpty(), 'ライン側：取り出し段1と2の先頭の箱を使い切る（時間は省略）', 0.9, 'human'),
    A.call(() => empty2.userData.setEmpty(), '', 0.01, 'human'),
    ...workerPick(W0, T, '作業者が空箱を取り出す'),
    ...workerPlace(W0, R, `空箱を、人の作業域のすぐ上の返却段（${Math.round(Lo.lv[liR].zf)}mm）へ`, 1.6),
    A.par('空箱は通路側の出口へ転がる／次の箱が手前へ寄る', 1.3, [A.advance(R, 1.3, ''), A.advance(T, 1.3, '')], 'human'),
    ...workerPick(W0, T2, '2段目の空箱も取り出す'),
    ...workerPlace(W0, R, '返却段へ置く', 1.6),
    A.par('空箱は出口側へ転がる', 1.3, [A.advance(R, 1.3, ''), A.advance(T2, 1.3, '')], 'human'),
    ...scan(m, () => wp(mk[0]), '手先カメラで棚の左右マーカーを読み、全間口と予備段の位置を計算'),
    // 低い段：足元の予備 → 取り出し段1（列の正面から横にずれた位置で、棚に向いて停止）
    ...takeFrom(rb, RV, stLR, `足元の予備（${skuCode(tc, sP1.li)}）の先頭の箱`),
    A.advance(RV, 0.6, '予備はこれで空になった'),
    ...putTo(rb, T, stP1, () => T.entryS, `取り出し段1（${skuCode(tc, sP1.li)}）の入口`, toLane(T)),
    A.advance(T, 1.2, '箱は重力で最後尾へ（人の手元は2箱に戻る）'),
    // 天面の2箱で足元の予備を補充（空のときだけ、2箱まとめて押し込む）
    up(ysOver, '手先を天面より上へ'),
    ...verify(m, () => deck[0], '天面の箱（同じ品番を2箱）のバーコードを照合', `照合OK：${deck[0].userData.code}`),
    ...deckTake(0, '天面の上の箱', stLR),
    ...putTo(deck[0], RV, stLR, () => RV.sAt(0), '空になった足元の予備の出口', toLaneFront(RV), [up(yTr, '肩より上へ持ち上げる（肩の前を通るとき、ひじが箱の上に来ないように）', 0.8), A.arc(m, () => Wr(RV.wpos(RV.sAt(0)).add(V3(0, 0, stLR.del))).setY(yTr), 1.8, '肩のまわりを棚の側へ回して車体の外へ（箱は肩の上を通らない）', { zMin: zOut })]),
    ...deckTake(1, '天面の下の箱', stLR),
    ...putTo(deck[1], RV, stLR, () => RV.sAt(0), '足元の予備の出口', toLaneFront(RV), [up(yTr, '肩より上へ持ち上げる', 0.8), A.arc(m, () => Wr(RV.wpos(RV.sAt(0)).add(V3(0, 0, stLR.del))).setY(yTr), 1.8, '肩のまわりを棚の側へ回して車体の外へ', { zMin: zOut })], true),
    // 高い段：頭上の予備 → 取り出し段2（正面の停止位置）
    ...travel(stLR, stHV, `通路に沿って、頭上の予備の停止位置（${stTxt(stHV)}）へ`),
    ...takeFrom(hb, HV, stHV, `頭上の予備（${skuCode(tc, liP + 1)}）の先頭の箱`),
    A.advance(HV, 1.0, '奥の箱が予備の先頭へ転がる'),
    ...putTo(hb, T2, stP2, () => T2.entryS, `取り出し段2（${skuCode(tc, liP + 1)}）の入口`, toLane(T2)),
    A.advance(T2, 1.2, '箱は重力で最後尾へ'),
    // 空箱の回収：返却段の出口 → 天面
    ...travel(stP2, stRet, `通路に沿って、返却段の出口の停止位置（${stTxt(stRet)}）へ`),
    ...takeFrom(empty1, R, stRet, '返却段の出口の空箱'),
    ...deckPut(1, empty1, '天面', stRet),
    A.advance(R, 1.0, '次の空箱が出口へ転がる'),
    ...takeFrom(empty2, R, stRet, '返却段の出口の空箱'),
    ...deckPut(0, empty2, '天面（上に積む）', stRet),
    A.sync(m, () => V3(stRet.x, 0, stRet.zT), p => riseAt(p, m.curWrist.y + 0.1), 1.2, '後退しながら、手先を上へ（シンクロ）'),
    A.arc(m, () => m.homeW(), 1.0, '手先を走行姿勢に戻す', { back: true, zMin: zOut }),
    A.turn(m, 0, 1.4, 'その場で90°旋回して通路の向きへ'),
    A.drive(m, stLR.x + 4.3, 2.4, 'MoMaは部品置き場へ（空箱を下ろし、次の品番の箱を2箱積む）'),
    A.turn(m, Math.PI, 1.4, '部品置き場で向きを変える'),
  ];
  return { steps, center: V3(0, 1.1, D / 2 + 0.3), span: Math.max(0.95, M(Lo.width) / 2.0) };
}

const f1 = v => (Math.round(v * 10) / 10).toFixed(1);

// 工場全体から使う：root の下に棚・MoMa・作業者を作り、tick(秒) で動かす。1回分が終わったら作り直してくり返す
return function (root) {
  let g = null, plan = null, tl = null, wait = 0;
  function load() {
    if (g) { root.remove(g); g.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
    LABELS = []; DIMS = []; WARN = new Set();
    g = new THREE.Group(); root.add(g); ROOT = g;
    plan = buildMain(g); tl = new Timeline(plan.steps); wait = 0;
    DIMS.forEach(d => { d.visible = false; });
  }
  load();
  return {
    center: plan.center, span: plan.span, area: AREA,
    tick(dt) { if (!tl.done) tl.update(dt); else if ((wait += dt) > 1.6) load(); },
  };
};
})();
