/* ピッキング → 移動 → プレイスを、機種ごとのレーンに並べて 3D で見せる。
   LexxMoMa は実機（動画 02-Mobile Manipulator video）に寄せた形：黄緑の足回り＋アルミフレームの箱＋白い協働ロボット。
   他機種は公開されている寸法・構成をもとにした簡略形です。
   使い方：var s = MomaScene(要素, MODELS, ARM); s.build(距離m, plans); s.update(秒); */
window.MomaScene = function (host, MODELS, ARM) {
  if (!window.THREE) return null;
  var V3 = function (x, y, z) { return new THREE.Vector3(x || 0, y || 0, z || 0); };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var ease = function (t) { t = clamp(t, 0, 1); return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; };
  var BOX = { x: 0.335, y: 0.149, z: 0.335 };          // 運ぶ箱（TP-331.5B 相当）
  var LANE_GAP = 2.1, SHELF_TOP = 0.86, SHELF_GAP = 0.32;
  var TOOL = 0.16;                                      // 手首から手先まで

  var renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true }); } catch (e) { return null; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  host.appendChild(renderer.domElement);
  var scene = new THREE.Scene();
  scene.background = new THREE.Color('#f4f7fa');
  var camera = new THREE.PerspectiveCamera(30, 2, 0.1, 200);
  scene.add(new THREE.HemisphereLight('#ffffff', '#c9d3db', 0.9));
  var sun = new THREE.DirectionalLight('#ffffff', 0.6); sun.position.set(3, 9, 7); scene.add(sun);

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
    return {
      shoulderW: function () { sh.updateWorldMatrix(true, false); return sh.localToWorld(V3()); },
      ik: function (w) {
        var s = this.shoulderW(), dx = w.x - s.x, dz = w.z - s.z, dy = w.y - s.y, r = Math.hypot(dx, dz), d = Math.hypot(r, dy);
        var max = L1 + L2 - 1e-4; if (d > max) { r *= max / d; dy *= max / d; d = max; }
        var psi = Math.atan2(-dz, dx), a2 = Math.acos(clamp((d * d - L1 * L1 - L2 * L2) / (2 * L1 * L2), -1, 1));
        var a1 = Math.atan2(dy, r) + Math.atan2(L2 * Math.sin(a2), L1 + L2 * Math.cos(a2));
        yaw.rotation.y = psi; sh.rotation.z = a1; el.rotation.z = -a2; wpg.rotation.z = -(a1 - a2); wy.rotation.y = Math.PI / 2 - psi;
      },
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

  function makeShelf(parent, x, z) {
    var top = SHELF_TOP, w = 0.6, d = 0.5, frame = mat('#d9d3c0');
    box(parent, w, 0.03, d, frame, x, top - 0.015, z);
    [-1, 1].forEach(function (sx) { [-1, 1].forEach(function (sz) { box(parent, 0.035, top, 0.035, frame, x + sx * (w / 2 - 0.02), top / 2, z + sz * (d / 2 - 0.02)); }); });
  }
  function makeCrate(color) {
    var g = new THREE.Group(), geo = new THREE.BoxGeometry(BOX.x, BOX.y, BOX.z);
    g.add(new THREE.Mesh(geo, mat(color)));
    g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: '#1d3f63' })));
    return g;
  }

  var world = null, lanes = [], dist = 10;

  function build(d, plans) {
    dist = d;
    if (world) scene.remove(world);
    world = new THREE.Group(); scene.add(world); lanes = [];
    host.querySelectorAll('.tag3d').forEach(function (t) { t.remove(); });
    var n = MODELS.length, depth = (n - 1) * LANE_GAP;
    var floor = new THREE.Mesh(new THREE.PlaneGeometry(d + 3, depth + 3.4), mat('#ffffff'));
    floor.rotation.x = -Math.PI / 2; floor.position.set(d / 2, 0, -depth / 2 - 0.3); world.add(floor);
    MODELS.forEach(function (m, i) {
      var z = -i * LANE_GAP;
      var R = BODIES[m.body]();
      var front = new THREE.Box3().setFromObject(R.g).max.z;   // 台車の手前側の端
      var shelfZ = z - (0.35 + SHELF_GAP + 0.25);
      var line = new THREE.Mesh(new THREE.PlaneGeometry(d + 1.4, 0.02), new THREE.MeshBasicMaterial({ color: m.ours ? '#0068B7' : '#b7c3cd' }));
      line.rotation.x = -Math.PI / 2; line.position.set(d / 2, 0.002, z + front + 0.1); world.add(line);
      makeShelf(world, 0, shelfZ);
      makeShelf(world, d, shelfZ);
      world.add(R.g);
      var crate = makeCrate(m.ours ? '#2f6fb3' : '#c27a12');
      world.add(crate);
      var tag = document.createElement('div');
      tag.className = 'tag3d' + (m.ours ? ' ours' : '');
      host.appendChild(tag);
      lanes.push({ m: m, p: plans[i], z: z, R: R, crate: crate, tag: tag, lastX: 0,
                   A: V3(0, SHELF_TOP + BOX.y / 2, shelfZ), B: V3(d, SHELF_TOP + BOX.y / 2, shelfZ) });
    });
    resize();
    fit(d, depth);
    update(0);
  }

  // 箱の中心 → その箱をつかむときの手首の位置
  function wristFor(c) { return c.clone().add(V3(0, 0, TOOL + BOX.z / 2)); }
  function mix(a, b, t) { return a.clone().lerp(b, ease(t)); }

  function baseX(p, t) {
    var tr = p.tr, tt = t - p.moveStart, a = tr.vp / tr.ta;
    if (tt <= 0) return 0;
    if (tt >= tr.t) return dist;
    if (tt < tr.ta) return 0.5 * a * tt * tt;
    if (tt < tr.t - tr.ta) return 0.5 * a * tr.ta * tr.ta + tr.vp * (tt - tr.ta);
    var r = tr.t - tt; return dist - 0.5 * a * r * r;
  }

  var lastT = 0;
  function update(t) {
    lastT = t;
    lanes.forEach(function (ln) {
      var p = ln.p, R = ln.R, arm = R.arm, x = baseX(p, t);
      R.g.position.set(x - R.rootX, 0, ln.z);         // アームの根元が棚の正面に来る位置
      R.spin.forEach(function (w) { w.rotation.y -= (x - ln.lastX) / 0.1; });
      ln.lastX = x;
      R.g.updateMatrixWorld(true);
      var s = arm.shoulderW();
      var home = s.clone().add(V3(0.05, 0.35, 0.05));
      var carry = s.clone().add(V3(0.05, 0.12, -0.25));
      var A = wristFor(ln.A), Aup = A.clone().add(V3(0, 0.2, 0.08));
      var B = wristFor(ln.B), Bup = B.clone().add(V3(0, 0.2, 0.08));
      var G = ARM.pick - ARM.overlap;               // つかみ終わる時刻（ここから先は引き戻し）
      var S = p.placeStart, Rr = ARM.place - ARM.overlap;
      var w, open = 1, held = false, placed = false;
      if (t < G * 0.4) w = mix(home, Aup, t / (G * 0.4));
      else if (t < G * 0.75) w = mix(Aup, A, (t - G * 0.4) / (G * 0.35));
      else if (t < G) { w = A; open = 1 - (t - G * 0.75) / (G * 0.25); held = t > G * 0.95; }
      else if (t < G + ARM.overlap / 2) { w = mix(A, Aup, (t - G) / (ARM.overlap / 2)); open = 0; held = true; }
      else if (t < S) { w = mix(Aup, carry, (t - G - ARM.overlap / 2) / (ARM.overlap / 2)); open = 0; held = true; }
      else if (t < S + ARM.overlap) { w = mix(carry, Bup, (t - S) / ARM.overlap); open = 0; held = true; }
      else if (t < S + ARM.overlap + Rr * 0.35) { w = mix(Bup, B, (t - S - ARM.overlap) / (Rr * 0.35)); open = 0; held = true; }
      else if (t < S + ARM.overlap + Rr * 0.55) { w = B; open = (t - S - ARM.overlap - Rr * 0.35) / (Rr * 0.2); placed = true; }
      else { w = mix(B, home, (t - S - ARM.overlap - Rr * 0.55) / (Rr * 0.45)); placed = true; }
      arm.ik(w);
      arm.setFingers(clamp(open, 0, 1));
      if (held) ln.crate.position.copy(w).add(V3(0, 0, -(TOOL + BOX.z / 2)));
      else ln.crate.position.copy(placed ? ln.B : ln.A);
    });
    renderer.render(scene, camera);
    placeTags(t);
  }

  // 棚・台車・札がすべて入る、いちばん近いカメラ位置を探す（手前・斜め上から）
  var fitArgs = null;
  function fit(d, depth) {
    fitArgs = [d, depth];
    var target = V3(d / 2, 0.5, -depth / 2 - 0.4), el = 34 * Math.PI / 180;
    var dir = V3(0, Math.sin(el), Math.cos(el)), pts = [];
    [-0.9, d + 0.8].forEach(function (x) { [-depth - 1.5, 0.7].forEach(function (z) { [0, 2.3].forEach(function (y) { pts.push(V3(x, y, z)); }); }); });
    for (var k = 2; k < 200; k *= 1.03) {
      camera.position.copy(target).addScaledVector(dir, k);
      camera.lookAt(target); camera.updateMatrixWorld(true);
      if (pts.every(function (p) { var q = p.clone().project(camera); return q.z > -1 && q.z < 1 && Math.abs(q.x) < 0.97 && Math.abs(q.y) < 0.95; })) break;
    }
  }
  function placeTags(t) {
    var w = host.clientWidth, h = host.clientHeight;
    lanes.forEach(function (ln) {
      var q = ln.R.g.position.clone().add(V3(ln.R.rootX, 2.0, -0.2)).project(camera);
      var p = ln.p, done = t >= p.total;
      var both = p.o > 0 && ((t > p.moveStart && t < p.moveStart + p.o) || (t > p.placeStart && t < p.moveEnd));
      ln.tag.textContent = (ln.m.short || ln.m.name) + '  ' + Math.min(t, p.total).toFixed(1) + '秒' + (both ? '　走りながらアーム作業' : '');
      ln.tag.classList.toggle('done', done);
      ln.tag.classList.toggle('both', both);
      var half = ln.tag.offsetWidth / 2, px = clamp((q.x + 1) / 2 * w, half + 4, w - half - 4);   // 枠の外にはみ出さない
      ln.tag.style.transform = 'translate(' + Math.round(px - half) + 'px,' + Math.round((1 - q.y) / 2 * h) + 'px) translateY(-100%)';
    });
  }
  function resize() {
    var w = host.clientWidth || 300, h = host.clientHeight || 240;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%';
    camera.aspect = w / h; camera.updateProjectionMatrix();
    if (fitArgs) fit(fitArgs[0], fitArgs[1]);
  }
  if (window.ResizeObserver) new ResizeObserver(function () { resize(); update(lastT); }).observe(host);

  return { build: build, update: update, camera: camera };   // camera は確認用
};
