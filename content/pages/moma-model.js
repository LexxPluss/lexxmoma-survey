/* LexxMoMa と比較機種の 3D の形（cycle3d.js と scene3d.js で共通）。
   LexxMoMa は R1 の説明資料の外観（shooter-concept.html の makeMoMa と同じ）：薄紫灰の車体・橙の駆動輪・FANUC CRX-20iA/L。
   他機種は公開されている寸法・構成をもとにした簡略形です。
   使い方：var M = MomaModel(); M.BODIES.lexx() → { g, arm, rootX, spin } */
window.MomaModel = function () {
  var V3 = function (x, y, z) { return new THREE.Vector3(x || 0, y || 0, z || 0); };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var BOX = { x: 0.335, y: 0.149, z: 0.335 };          // 運ぶ箱（TP-331.5B 相当）
  var TOOL = 0.16;                                      // 手首から手先まで

  var _mc = {};
  function mat(color, o) {
    var k = color + (o ? JSON.stringify(o) : '');
    return _mc[k] || (_mc[k] = new THREE.MeshStandardMaterial(Object.assign({ color: color, roughness: 0.6, metalness: 0.05 }, o || {})));
  }
  function box(parent, sx, sy, sz, color, x, y, z, o) {
    var b = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), typeof color === 'string' ? mat(color, o) : color);
    b.position.set(x, y, z); parent.add(b); return b;
  }
  // 軸の向きを指定した円柱（axis: 'x' | 'y' | 'z'）。r2 を渡すと先細り
  function cyl(parent, r, len, color, x, y, z, axis, r2) {
    var c = new THREE.Mesh(new THREE.CylinderGeometry(r2 == null ? r : r2, r, len, 24), typeof color === 'string' ? mat(color) : color);
    if (axis === 'x') c.rotation.z = -Math.PI / 2;
    if (axis === 'z') c.rotation.x = Math.PI / 2;
    c.position.set(x, y, z); parent.add(c); return c;
  }

  /* ---- 協働ロボットのアーム（根元の y 軸回転＋肩・肘の2リンク＋手首。手先は常に -z ＝棚の方向） ---- */
  function makeArm(parent, style, rootPos) {
    var white = style.body, ring = style.ring, L1 = style.L1, L2 = style.L2, J2 = style.j2H || 0.26;   // J2：根元から肩までの高さ
    var root = new THREE.Group(); root.position.copy(rootPos); parent.add(root);
    cyl(root, 0.085, 0.1, white, 0, 0.05, 0, 'y');
    cyl(root, 0.088, 0.025, ring, 0, 0.11, 0, 'y');
    var yaw = new THREE.Group(); root.add(yaw);
    cyl(yaw, 0.078, 0.12, white, 0, 0.18, 0, 'y');
    var sh = new THREE.Group(); sh.position.y = J2; yaw.add(sh);
    cyl(sh, 0.085, 0.19, white, 0, 0, 0, 'z');
    cyl(sh, 0.06, L1, white, L1 / 2, 0, 0, 'x', 0.052);
    var el = new THREE.Group(); el.position.x = L1; sh.add(el);
    cyl(el, 0.068, 0.16, white, 0, 0, 0, 'z');
    cyl(el, 0.048, L2, white, L2 / 2, 0, 0, 'x', 0.042);
    var wpg = new THREE.Group(); wpg.position.x = L2; el.add(wpg);
    cyl(wpg, 0.05, 0.12, white, 0, 0, 0, 'z');
    var wy = new THREE.Group(); wpg.add(wy);
    var tg = new THREE.Group(); wy.add(tg);
    cyl(tg, 0.05, 0.03, ring, 0.03, 0, 0, 'x');
    box(tg, TOOL - 0.06, 0.09, 0.1, style.tool, 0.045 + (TOOL - 0.06) / 2, 0, 0);
    box(tg, 0.025, 0.05, BOX.x + 0.08, '#56636e', TOOL - 0.0125, 0, 0);
    var fl = 0.11, fingers = [-1, 1].map(function (s) { return box(tg, fl, 0.05, 0.012, '#3f4a54', TOOL + fl / 2, 0, s * (BOX.x / 2 + 0.035)); });
    var tip = new THREE.Object3D(); tip.position.x = TOOL; tg.add(tip);
    return {
      shoulderW: function () { sh.updateWorldMatrix(true, false); return sh.localToWorld(V3()); },
      // 手首を w（ワールド座標）へ。radial なら手先は根元から外向き、そうでなければ台車の -z（棚の方向）を向く
      ik: function (w, radial) {
        root.updateWorldMatrix(true, false);
        var p = root.worldToLocal(w.clone()), dx = p.x, dz = p.z, dy = p.y - J2, r = Math.hypot(dx, dz), d = Math.hypot(r, dy);
        var max = L1 + L2 - 1e-4; if (d > max) { r *= max / d; dy *= max / d; d = max; }
        var psi = Math.atan2(-dz, dx), a2 = Math.acos(clamp((d * d - L1 * L1 - L2 * L2) / (2 * L1 * L2), -1, 1));
        var a1 = Math.atan2(dy, r) + Math.atan2(L2 * Math.sin(a2), L1 + L2 * Math.cos(a2));
        yaw.rotation.y = psi; sh.rotation.z = a1; el.rotation.z = -a2; wpg.rotation.z = -(a1 - a2); wy.rotation.y = radial ? 0 : Math.PI / 2 - psi;
      },
      tipW: function () { tip.updateWorldMatrix(true, false); return tip.getWorldPosition(V3()); },   // 手先（指の先）
      toolYaw: function () { var q = new THREE.Quaternion(); tg.getWorldQuaternion(q); return new THREE.Euler().setFromQuaternion(q, 'YXZ').y; },
      setFingers: function (open) { fingers.forEach(function (f, i) { f.position.z = (i ? 1 : -1) * (BOX.x / 2 + 0.008 + 0.027 * open); }); }
    };
  }
  var CRX = { body: '#eceeef', ring: '#2fb24c', tool: '#eef0ee', L1: 0.71, L2: 0.54, j2H: 0.185 };   // FANUC CRX-20iA/L：白い本体に緑の輪。上腕710・前腕540。肩は取付面から245（付け根の台60を含む）
  var COBOT = { body: '#dfe3e6', ring: '#3a4148', tool: '#c9cfd4', L1: 0.65, L2: 0.6 };    // 一般的な協働ロボット（灰色）

  /* ---- LexxMoMa R1：説明資料の外観（shooter-concept.html の makeMoMa と同じ形・寸法）
     車体 D700（前後・x）×W650（左右・z）×H750、走行台車の枠の上面 200、アーム FANUC CRX-20iA/L を天面の中央に ---- */
  function roundedBox(w, h, d, r, material) {
    var s = new THREE.Shape(), x = w / 2, z = d / 2;
    s.moveTo(-x + r, -z); s.lineTo(x - r, -z); s.quadraticCurveTo(x, -z, x, -z + r); s.lineTo(x, z - r); s.quadraticCurveTo(x, z, x - r, z);
    s.lineTo(-x + r, z); s.quadraticCurveTo(-x, z, -x, z - r); s.lineTo(-x, -z + r); s.quadraticCurveTo(-x, -z, -x + r, -z);
    var g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false, curveSegments: 6 });
    g.rotateX(-Math.PI / 2);   // 押し出し方向を上（+y）へ
    return new THREE.Mesh(g, material);
  }
  function plate(parent, w, h, text, x, y, z, ry) {   // 車体の名前の板
    var c = document.createElement('canvas'); c.width = 256; c.height = 64;
    var x2 = c.getContext('2d'); x2.fillStyle = '#a3a8c2'; x2.fillRect(0, 0, 256, 64);
    x2.fillStyle = '#fff'; x2.font = '700 40px sans-serif'; x2.textAlign = 'center'; x2.textBaseline = 'middle'; x2.fillText(text, 128, 34);
    var p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(c), roughness: 0.8 }));
    p.position.set(x, y, z); p.rotation.y = ry || 0; parent.add(p);
  }
  function makeLexx() {
    var g = new THREE.Group(), L = 0.7, W = 0.65, Hc = 0.2, Hb = 0.75;
    var frame = mat('#a7adb3', { metalness: 0.35, roughness: 0.45 }), frameD = mat('#6e757c', { metalness: 0.3 }), cab = mat('#a3a8c2', { roughness: 0.55 });
    var dark = mat('#23292f'), green = mat('#2fb24c', { roughness: 0.4 }), orange = mat('#d9822b', { metalness: 0.3, roughness: 0.4 });
    var clear = new THREE.MeshStandardMaterial({ color: '#dfe7ee', transparent: true, opacity: 0.55, roughness: 0.15 });
    // 走行台車：枠・キャスター・駆動輪・前後のブラケット
    box(g, L, 0.05, W, frame, 0, Hc - 0.025, 0);
    box(g, L - 0.06, 0.09, W - 0.12, frameD, 0, Hc - 0.095, 0);
    [-1, 1].forEach(function (sx) { [-1, 1].forEach(function (sz) {
      cyl(g, 0.05, 0.045, clear, sx * (L / 2 - 0.08), 0.05, sz * (W / 2 - 0.05), 'z');
      box(g, 0.05, 0.06, 0.05, frameD, sx * (L / 2 - 0.08), 0.11, sz * (W / 2 - 0.05));
    }); });
    var spin = [-1, 1].map(function (sz) {
      var w = cyl(g, 0.085, 0.05, orange, 0, 0.085, sz * (W / 2 - 0.03), 'z');
      cyl(g, 0.04, 0.055, dark, 0, 0.085, sz * (W / 2 - 0.03), 'z');
      return w;
    });
    [-1, 1].forEach(function (sx) { box(g, 0.012, 0.11, 0.24, frame, sx * (L / 2 + 0.006), Hc - 0.07, 0); box(g, 0.006, 0.03, 0.12, dark, sx * (L / 2 + 0.013), Hc - 0.07, 0); });
    // キャビネット（角を丸めた箱）＋天板
    var cw = L - 0.04, cd = W - 0.04, ch = Hb - Hc - 0.012;
    var body = roundedBox(cw, ch, cd, 0.035, cab); body.position.y = Hc; g.add(body);
    var lid = roundedBox(cw + 0.008, 0.012, cd + 0.008, 0.038, mat('#b4b8cf')); lid.position.y = Hb - 0.012; g.add(lid);
    // 前面（+x）の制御盤の扉：表示灯6つ（右端は緑）と取っ手
    box(g, 0.006, ch * 0.78, cd * 0.82, '#c9ccd6', cw / 2 + 0.003, Hc + ch * 0.45, 0);
    for (var i = 0; i < 6; i++) cyl(g, 0.009, 0.01, i === 5 ? green : dark, cw / 2 + 0.008, Hc + ch * 0.74, -0.09 + i * 0.035, 'x');
    box(g, 0.012, 0.11, 0.03, dark, cw / 2 + 0.009, Hc + ch * 0.45, cd * 0.33);
    // 側面（+z）の収納口：前後250×高さ450
    box(g, 0.25, 0.45, 0.006, '#3b4048', -cw / 2 + 0.06 + 0.125, Hc + 0.04 + 0.225, cd / 2 + 0.002);
    box(g, 0.22, 0.42, 0.004, '#5d6470', -cw / 2 + 0.06 + 0.125, Hc + 0.04 + 0.225, cd / 2 + 0.004);
    plate(g, 0.3, 0.075, 'LexxMoMa', 0.15, Hb - 0.08, cd / 2 + 0.002, 0);
    plate(g, 0.3, 0.075, 'LexxMoMa', -0.1, Hb - 0.08, -cd / 2 - 0.002, Math.PI);
    var stM = new THREE.MeshStandardMaterial({ color: '#8fdcff', emissive: '#2fa8ff', emissiveIntensity: 0.8 });
    [-1, 1].forEach(function (sz) { box(g, L * 0.6, 0.014, 0.006, stM, 0, Hc + 0.02, sz * (cd / 2 + 0.004)); });
    box(g, 0.2, 0.06, 0.2, dark, 0, Hb + 0.03, 0);   // アームの黒い付け根
    var arm = makeArm(g, CRX, V3(0, Hb + 0.06, 0));
    return { g: g, arm: arm, rootX: 0, spin: spin, top: Hb };
  }

  /* ---- 低い台車型の AMR/AGV ＋台座の上の協働ロボット（他機種。公開寸法をもとに簡略化） ---- */
  function makeLow(o) {
    var g = new THREE.Group(), L = o.L, W = o.W, H = o.H;
    box(g, L, H * 0.55, W, o.lower, 0, H * 0.3, 0);
    box(g, L - 0.02, H * 0.42, W - 0.02, o.upper, 0, H * 0.79, 0);
    box(g, L * 0.3, 0.035, 0.01, '#15191c', L / 2 - L * 0.15, H * 0.35, W / 2 + 0.003);   // センサー窓
    box(g, 0.01, 0.035, W * 0.6, '#15191c', L / 2 + 0.003, H * 0.35, 0);
    var pz = -W / 2 + o.pedW / 2 + 0.04;
    box(g, o.pedL, o.pedH, o.pedW, o.ped, o.pedX, H + o.pedH / 2, pz);
    var arm = makeArm(g, o.arm, V3(o.pedX, H + o.pedH, pz));
    return { g: g, arm: arm, rootX: o.pedX, spin: [] };
  }
  var BODIES = {
    lexx: makeLexx,
    // オムロン LD-90：699×500×383mm（公開値）。アームは台座に載せた構成を想定
    ld90: function () { return makeLow({ L: 0.699, W: 0.5, H: 0.383, lower: '#3b4249', upper: '#d3d8dc', ped: '#c4cacf', pedL: 0.36, pedW: 0.36, pedH: 0.42, pedX: 0, arm: COBOT }); },
    // オムロン LD-250：963×692×383mm（公開値）
    ld250: function () { return makeLow({ L: 0.963, W: 0.692, H: 0.383, lower: '#3b4249', upper: '#d3d8dc', ped: '#c4cacf', pedL: 0.42, pedW: 0.42, pedH: 0.42, pedX: 0.12, arm: COBOT }); },
    // 明電舎 RocoMo-V：低床の AGV に CRX-20iA/L を載せた構成（寸法は仮）
    rocomo: function () { return makeLow({ L: 1.0, W: 0.7, H: 0.32, lower: '#4b5560', upper: '#e9ecee', ped: '#dfe3e6', pedL: 0.45, pedW: 0.45, pedH: 0.45, pedX: 0.15, arm: CRX }); }
  };

  return { mat: mat, box: box, cyl: cyl, makeArm: makeArm, BODIES: BODIES, BOX: BOX, TOOL: TOOL, CRX: CRX, COBOT: COBOT };
};
