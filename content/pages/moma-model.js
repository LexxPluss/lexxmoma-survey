/* LexxMoMa と比較機種の 3D の形（cycle3d.js と scene3d.js で共通）。
   LexxMoMa は実機（動画 02-Mobile Manipulator video）に寄せた形：黄緑の足回り＋アルミフレームの箱＋白い協働ロボット。
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
    var white = style.body, ring = style.ring, L1 = style.L1, L2 = style.L2;
    var root = new THREE.Group(); root.position.copy(rootPos); parent.add(root);
    cyl(root, 0.085, 0.1, white, 0, 0.05, 0, 'y');
    cyl(root, 0.088, 0.025, ring, 0, 0.11, 0, 'y');
    var yaw = new THREE.Group(); root.add(yaw);
    cyl(yaw, 0.078, 0.12, white, 0, 0.18, 0, 'y');
    var sh = new THREE.Group(); sh.position.y = 0.26; yaw.add(sh);
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
        var p = root.worldToLocal(w.clone()), dx = p.x, dz = p.z, dy = p.y - 0.26, r = Math.hypot(dx, dz), d = Math.hypot(r, dy);
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
  var CRX = { body: '#f3f4f2', ring: '#3dbb3a', tool: '#eef0ee', L1: 0.71, L2: 0.6 };      // 白い本体に緑の輪（実機の動画のアーム）
  var COBOT = { body: '#dfe3e6', ring: '#3a4148', tool: '#c9cfd4', L1: 0.65, L2: 0.6 };    // 一般的な協働ロボット（灰色）

  /* ---- LexxMoMa：黄緑の足回り＋アルミフレームの箱（中に制御盤・配線）＋白いアーム ---- */
  function makeLexx() {
    var g = new THREE.Group(), L = 0.8, W = 0.6, LIME = '#a9cf2a', ALU = '#c8cdd2';
    var spin = [];
    box(g, L, 0.14, W, LIME, 0, 0.13, 0);                                   // 足回り
    box(g, L - 0.06, 0.03, W - 0.06, '#7f9c1d', 0, 0.06, 0);
    [-1, 1].forEach(function (sz) {                                          // 駆動輪（側面の中央）
      spin.push(cyl(g, 0.1, 0.06, '#1f2427', 0, 0.1, sz * (W / 2 + 0.01), 'z'));
      cyl(g, 0.045, 0.065, '#9aa3aa', 0, 0.1, sz * (W / 2 + 0.012), 'z');
    });
    [-1, 1].forEach(function (sx) { [-1, 1].forEach(function (sz) {        // キャスター
      cyl(g, 0.035, 0.03, '#2b3135', sx * (L / 2 - 0.08), 0.035, sz * (W / 2 - 0.08), 'z');
    }); });
    var y0 = 0.2, y1 = 0.88, t = 0.03, alu = { metalness: 0.4 };           // アルミフレームの箱
    [-1, 1].forEach(function (sx) { [-1, 1].forEach(function (sz) {
      box(g, t, y1 - y0, t, ALU, sx * (L / 2 - t / 2), (y0 + y1) / 2, sz * (W / 2 - t / 2), alu);
    }); });
    [y0 + t / 2, 0.52, y1 - t / 2].forEach(function (y) {
      [-1, 1].forEach(function (s) {
        box(g, L, t, t, ALU, 0, y, s * (W / 2 - t / 2), alu);
        box(g, t, t, W, ALU, s * (L / 2 - t / 2), y, 0, alu);
      });
    });
    box(g, L - 0.08, 0.2, W - 0.08, '#1d2226', 0, 0.32, 0);                  // 下段：バッテリー・駆動系（黒）
    box(g, 0.3, 0.26, W - 0.12, '#59646e', -0.17, 0.68, 0);                   // 上段：制御盤
    box(g, 0.24, 0.2, 0.08, '#e7eaec', 0.18, 0.66, W / 2 - 0.08);
    [0.62, 0.7].forEach(function (y, i) {                                     // 青い配線の束
      var c = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.016, 8, 20), mat('#2f7fe0'));
      c.position.set(0.12 + i * 0.06, y, W / 2 - 0.07); g.add(c);
    });
    box(g, L, 0.02, W, ALU, 0, y1 + 0.01, 0, alu);                            // 天板
    box(g, 0.14, 0.1, 0.12, '#f2f3f3', L / 2 - 0.1, y1 + 0.07, W / 2 - 0.08); // 天板の上の小箱
    cyl(g, 0.014, 0.01, '#e0302a', -0.05, 0.6, W / 2 + 0.002, 'z');          // ランプ
    var arm = makeArm(g, CRX, V3(0, y1 + 0.02, -0.05));
    return { g: g, arm: arm, rootX: 0, spin: spin };
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
