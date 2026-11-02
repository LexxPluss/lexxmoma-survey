/* 使いどころの 3D シミュレーション（自動車工場でよく見る景色の中で、LexxMoMa が作業場所を回る）。
   見た目は shooter-concept.html（方眼の床・通路の青・作業域の緑・Φ28パイプの棚）に合わせています。
   機体の形は moma-model.js（先に読み込む）。
   1つの工場の床に5つの作業場所を並べ、LexxMoMa が順番に回って作業する。
   使い方：var s = FactoryScene(要素, { station: 作業場所が変わったときの関数(番号) }); s.tick(秒); s.jump(番号); s.names */
window.FactoryScene = function (host, ui) {
  if (!window.THREE || !window.MomaModel) return null;
  var V3 = function (x, y, z) { return new THREE.Vector3(x || 0, y || 0, z || 0); };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var ease = function (t) { t = clamp(t, 0, 1); return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; };
  var M = MomaModel(), mat = M.mat, box = M.box, cyl = M.cyl, TOOL = M.TOOL;
  var C = { blue: '#0068B7', green: '#3EB370', frame: '#D9D3C0', full: '#2f6fb3', empty: '#cdd5db', ink: '#25323c' };

  var renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true }); } catch (e) { return null; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.appendChild(renderer.domElement);
  var scene = new THREE.Scene();
  scene.background = new THREE.Color('#eef2f5');
  var camera = new THREE.PerspectiveCamera(32, 1.6, 0.1, 200);
  scene.add(new THREE.HemisphereLight('#ffffff', '#c9d3db', 0.75));
  var sun = new THREE.DirectionalLight('#ffffff', 0.75);
  sun.position.set(4, 10, 6); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 1, far: 30 });
  scene.add(sun);
  function shade(o) { o.traverse(function (m) { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); return o; }

  /* ---------------- 景色の部品 ---------------- */
  function floor(x0, x1, z0, z1) {
    var w = x1 - x0, d = z1 - z0;
    var f = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat('#f7f9fa'));
    f.rotation.x = -Math.PI / 2; f.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2); f.receiveShadow = true; scene.add(f);
    var g = new THREE.GridHelper(Math.max(w, d), Math.round(Math.max(w, d) * 2), '#dbe2e8', '#e8edf1');
    g.position.set((x0 + x1) / 2, 0.002, (z0 + z1) / 2); scene.add(g);
  }
  function zone(x0, x1, z0, z1, color, op) {
    var p = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: op, depthWrite: false }));
    p.rotation.x = -Math.PI / 2; p.position.set((x0 + x1) / 2, 0.004, (z0 + z1) / 2); scene.add(p);
  }
  function tape(x0, x1, z, color) {      // 床の区画線
    var p = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, 0.07), new THREE.MeshBasicMaterial({ color: color || '#f2c230' }));
    p.rotation.x = -Math.PI / 2; p.position.set((x0 + x1) / 2, 0.006, z); scene.add(p);
  }
  function pillar(x, z, name) {
    var g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g);
    box(g, 0.5, 4.2, 0.5, '#d5dbe0', 0, 2.1, 0);
    box(g, 0.52, 0.3, 0.52, '#f2c230', 0, 0.15, 0);
    var c = document.createElement('canvas'); c.width = 128; c.height = 64;
    var x2 = c.getContext('2d'); x2.fillStyle = '#1d4f8a'; x2.fillRect(0, 0, 128, 64); x2.fillStyle = '#fff'; x2.font = '700 38px sans-serif'; x2.textAlign = 'center'; x2.textBaseline = 'middle'; x2.fillText(name, 64, 34);
    var pl = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.21), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c) }));
    pl.position.set(0, 2.4, 0.252); g.add(pl);
    shade(g);
  }
  function crate(color, size) {          // 部品箱（TP 規格の箱を簡略化：上が開いている）
    var s = size || { x: 0.335, y: 0.149, z: 0.335 };
    var g = new THREE.Group();
    var b = new THREE.Mesh(new THREE.BoxGeometry(s.x, s.y, s.z), mat(color)); g.add(b);
    var top = new THREE.Mesh(new THREE.PlaneGeometry(s.x - 0.03, s.z - 0.03), mat('#1d3f63'));
    top.rotation.x = -Math.PI / 2; top.position.y = s.y / 2 + 0.001; g.add(top);
    g.userData = { size: s, body: b, top: top, setColor: function (c) { b.material = mat(c); top.material = mat(c === C.empty ? '#aab6c0' : '#1d3f63'); } };
    return shade(g);
  }
  function part(color) {                 // 加工部品（小さなブロック）
    var g = new THREE.Group();
    box(g, 0.24, 0.1, 0.2, color, 0, 0, 0, color === '#a9bfd0' ? { metalness: 0.5, roughness: 0.35 } : null);
    cyl(g, 0.04, 0.11, '#3a4148', 0.05, 0.005, 0, 'y');
    g.userData = { size: { x: 0.24, y: 0.1, z: 0.2 } };
    return shade(g);
  }
  function worker(x, z, rotY) {          // 作業者（緑のベスト・白いヘルメット）
    var g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rotY || 0; scene.add(g);
    var vest = mat(C.green), pants = mat('#44525c'), skin = mat('#efd9c6');
    [-1, 1].forEach(function (s) { box(g, 0.13, 0.84, 0.15, pants, s * 0.085, 0.42, 0); });
    box(g, 0.4, 0.58, 0.23, vest, 0, 1.13, 0);
    box(g, 0.41, 0.06, 0.24, '#f2f5f7', 0, 1.0, 0);
    var hd = new THREE.Mesh(new THREE.SphereGeometry(0.105, 16, 12), skin); hd.position.y = 1.54; g.add(hd);
    var hm = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat('#ffffff')); hm.position.y = 1.56; g.add(hm);
    var arms = [-1, 1].map(function (s) {
      var a = new THREE.Group(); a.position.set(s * 0.25, 1.36, 0); g.add(a);
      box(a, 0.09, 0.58, 0.1, vest, 0, -0.29, 0);
      return a;
    });
    shade(g);
    return { g: g, reach: function (r) { arms.forEach(function (a) { a.rotation.x = -r * 1.25; }); } };
  }
  function car(color) {                  // 組立中の車体（白いボディ）
    var g = new THREE.Group();
    box(g, 4.3, 0.62, 1.72, color, 0, 0.62, 0);
    box(g, 2.3, 0.52, 1.56, color, -0.25, 1.18, 0);
    box(g, 2.1, 0.4, 1.58, '#5b7487', -0.25, 1.2, 0, { metalness: 0.3, roughness: 0.2 });
    box(g, 4.6, 0.12, 1.2, '#8b98a4', 0, 0.18, 0);     // 台車（スキッド）
    return shade(g);
  }
  function andon(x, z, w) {              // ライン上のあんどん
    var g = new THREE.Group(); g.position.set(x, 3.2, z); scene.add(g);
    box(g, w, 0.5, 0.08, '#1f2933', 0, 0, 0);
    var lamps = [];
    for (var i = 0; i < 8; i++) {
      var m = new THREE.MeshStandardMaterial({ color: '#3EB370', emissive: '#3EB370', emissiveIntensity: 0.6 });
      var l = new THREE.Mesh(new THREE.BoxGeometry(w / 10, 0.3, 0.02), m); l.position.set(-w / 2 + w / 16 + i * (w / 8.6), 0, 0.05); g.add(l); lamps.push(m);
    }
    [-w / 2 + 0.1, w / 2 - 0.1].forEach(function (dx) { box(g, 0.03, 1.2, 0.03, '#8b98a4', dx, 0.85, 0); });
    return lamps;
  }
  function pipeRack(g, w, d, h, color) { // Φ28 パイプの骨組み（四隅の柱と上下の枠）
    var t = 0.028, m = mat(color || C.frame);
    [-1, 1].forEach(function (sx) { [-1, 1].forEach(function (sz) { box(g, t, h, t, m, sx * w / 2, h / 2, sz * d / 2); }); });
    [0.06, h].forEach(function (y) { [-1, 1].forEach(function (s) { box(g, w, t, t, m, 0, y, s * d / 2); box(g, t, t, d, m, s * w / 2, y, 0); }); });
  }

  /* ---------------- LexxMoMa を動かす台本 ---------------- */
  var R = M.BODIES.lexx(); shade(R.g); scene.add(R.g);
  var HOME = V3(0.08, 1.52, 0.05), CARRY = V3(0.02, 1.42, -0.3);
  var bot = { x: 0, wristL: HOME.clone(), open: 1, held: null, lastX: 0 };
  var queue = [], cur = null, script = null;   // script：台本が空になったら次の作業を積む関数
  function act(o) { queue.push(Object.assign({ dur: 0 }, o)); }
  function drive(x) {
    act({ start: function () { this.x0 = bot.x; this.dur = Math.abs(x - this.x0) / 1.3 + 0.8; },
          update: function (p) { bot.x = this.x0 + (x - this.x0) * ease(p); } });
  }
  function armTo(fn, dur) {               // fn：手首の目標（ワールド座標）を返す関数、または台車の上での決まった姿勢
    act({ dur: dur || 0.9, start: function () { this.a = bot.wristL.clone(); this.b = fn.isVector3 ? fn.clone() : R.g.worldToLocal(fn()); },
          update: function (p) { bot.wristL.copy(this.a).lerp(this.b, ease(p)); } });
  }
  function grip(open) { act({ dur: 0.35, start: function () { this.a = bot.open; }, update: function (p) { bot.open = this.a + (open - this.a) * p; } }); }
  function call(fn) { act({ start: fn }); }
  function until(cond) { act({ dur: 1e9, until: cond }); }
  // 中心 c に置く（取る）ときの手首の位置：肩から c へ向かう向きで、手先の分だけ手前
  function wristFor(c, half) {
    var s = R.arm.shoulderW(), d = V3(c.x - s.x, 0, c.z - s.z).normalize();
    return c.clone().addScaledVector(d, -(TOOL + half));
  }
  function above(w, c) { var s = R.arm.shoulderW(), d = V3(c.x - s.x, 0, c.z - s.z).normalize(); return w.clone().addScaledVector(d, -0.22).add(V3(0, 0.1, 0)); }
  function pick(obj, getCenter, after) {  // obj：取る物を返す関数、getCenter：その中心（ワールド）
    var half = function () { return obj().userData.size.x / 2; }, c;
    armTo(function () { c = getCenter(); return above(wristFor(c, half()), c); });
    armTo(function () { return wristFor(c, half()); }, 0.6);
    grip(0);
    call(function () { var o = obj(); if (o.parent !== scene) scene.attach(o); bot.held = o; if (after) after(); });
    armTo(function () { return above(wristFor(c, bot.held.userData.size.x / 2), c); }, 0.6);
    armTo(CARRY, 0.8);
  }
  function place(getCenter, onDrop, onRobot) {   // onRobot：台車の上に置く（台車と一緒に動く）
    var half, c;
    armTo(function () { half = bot.held.userData.size.x / 2; c = getCenter(); return above(wristFor(c, half), c); });
    armTo(function () { return wristFor(c, half); }, 0.6);
    call(function () { var o = bot.held; bot.held = null; o.position.copy(c); o.rotation.set(0, 0, 0); if (onRobot) R.g.attach(o); if (onDrop) onDrop(o); });
    grip(1);
    armTo(function () { return above(wristFor(c, half), c); }, 0.6);
    armTo(CARRY, 0.7);
  }
  function stepBot(dt) {
    while (dt > 0) {
      if (!cur) {
        if (!queue.length) script();
        cur = queue.shift(); cur.t = 0;
        if (cur.start) cur.start();
      }
      if (cur.until) { if (cur.until()) { cur = null; continue; } return; }
      var use = Math.min(dt, cur.dur - cur.t);
      cur.t += use; dt -= use;
      if (cur.update) cur.update(cur.dur ? cur.t / cur.dur : 1);
      if (cur.t >= cur.dur - 1e-9) cur = null;
    }
  }
  function poseBot() {
    R.g.position.set(bot.x, 0, bot.z);
    R.spin.forEach(function (w) { w.rotation.y -= (bot.x - bot.lastX) / 0.1; });
    bot.lastX = bot.x;
    R.g.updateMatrixWorld(true);
    R.arm.ik(R.g.localToWorld(bot.wristL.clone()), true);
    R.arm.setFingers(clamp(bot.open, 0, 1));
    if (bot.held) {
      var yaw = R.arm.toolYaw(), half = bot.held.userData.size.x / 2;
      bot.held.position.copy(R.arm.tipW()).add(V3(Math.cos(yaw) * half, 0, -Math.sin(yaw) * half));
      bot.held.rotation.set(0, yaw, 0);
    }
  }

  /* ---------------- 1つの工場の床に、5つの作業場所を並べる ---------------- */
  // どの作業場所も、正面（通路側）を z = -0.35 にそろえる。LexxMoMa は z = 0.1 の通路を x 方向に走る
  var clock = 0;
  bot.z = 0.1;
  floor(-17, 16, -4.9, 2);
  zone(-17, 16, -0.25, 0.45, '#5AA0DC', 0.14);           // LexxMoMa の通路
  tape(-17, 16, -0.25); tape(-17, 16, 0.45);
  [[-9, 'C11'], [-3, 'C12'], [3, 'C13'], [9, 'C14']].forEach(function (p) { pillar(p[0], -3.3, p[1]); });
  function cart(x, z) {                   // 2段の台車（上段の高さ 0.78）
    var g = new THREE.Group(); g.position.set(x, 0, z == null ? -0.75 : z); scene.add(g);
    box(g, 0.9, 0.03, 0.6, '#8b98a4', 0, 0.78, 0); box(g, 0.9, 0.03, 0.6, '#8b98a4', 0, 0.3, 0);
    [-1, 1].forEach(function (sx) { [-1, 1].forEach(function (sz) { box(g, 0.03, 0.8, 0.03, '#8b98a4', sx * 0.43, 0.4, sz * 0.28); }); });
    return shade(g);
  }
  function row(x, z, y, make, n) {        // 台の上に部品を横一列に並べる（取ると補充される）
    var list = [];
    for (var k = 0; k < n; k++) { var o = make(); scene.add(o); list.push(o); }
    list.reset = function () { list.forEach(function (o, k) { o.position.set(x + (k - (n - 1) / 2) * 0.28, y, z); }); };
    list.take = function () { var o = list.shift(); var q = make(); scene.add(q); list.push(q); list.reset(); return o; };
    list.reset();
    return list;
  }
  var RAW = '#5b6670', DONE = '#a9bfd0';
  var doneMat = function () { return mat(DONE, { metalness: 0.5, roughness: 0.35 }); };
  box(R.g, 0.36, 0.02, 0.5, '#9aa5ae', -0.22, 0.905, 0.0);        // 台車の上の置き台
  var DECK = { raw: V3(-0.22, 0.965, 0.13), done: V3(-0.22, 0.965, -0.13) };
  var deckW = function (k) { return R.g.localToWorld(DECK[k].clone()); };
  var onDeck = {};
  var stations = [];

  /* 1. 生産ライン横の部品供給：ライン脇の棚へ箱を入れ、空箱を回収する */
  (function () {
    var X = -12, SUP = 0.86, RET = 1.38, RZ = -0.9;
    zone(-17, -7, -2.85, -1.5, C.green, 0.12); tape(-17, -7, -2.85); tape(-17, -7, -1.5);
    box(scene, 10.5, 0.25, 2.1, '#cfd6dc', -12, 0.125, -3.9);
    for (var k = 0; k < 10; k++) box(scene, 0.04, 0.02, 2.1, '#b8c2ca', -16.7 + k, 0.26, -3.9);
    var cars = [-15, -9.6].map(function (x) { var c = car('#f4f5f6'); c.position.set(x, 0.25, -3.9); scene.add(c); return c; });
    var lamps = andon(-12, -3.9, 3.6);
    var g = new THREE.Group(); g.position.set(X, 0, RZ); scene.add(g);
    pipeRack(g, 0.86, 1.1, 1.62);
    [[SUP - 0.03, -0.04], [RET - 0.03, 0.04]].forEach(function (lv) { var p = box(g, 0.8, 0.02, 1.1, '#c5cdd3', 0, lv[0], 0); p.rotation.x = lv[1]; });
    box(g, 0.86, 0.5, 0.01, '#eef2f5', 0, 0.3, -0.55);
    shade(g);
    var w = worker(X, -2.05, 0);
    var laneZ = function (lane, i) { return lane === 'sup' ? RZ - 0.33 + i * 0.36 : RZ + 0.33 - i * 0.36; };
    var sup = [], ret = [], anim = null, timer = 4;
    for (var n = 0; n < 2; n++) { var c = crate(C.full); scene.add(c); sup.push(c); c.position.set(X, SUP + 0.075, laneZ('sup', n)); }
    var st = new THREE.Group(); st.position.set(X - 1.6, 0, -0.85); scene.add(st);
    pipeRack(st, 0.86, 0.9, 1.2); box(st, 0.8, 0.02, 0.9, '#c5cdd3', 0, SUP - 0.03, 0); shade(st);
    var stockAt = V3(X - 1.6, SUP + 0.075, -0.65);
    var stock = crate(C.full); scene.add(stock); stock.position.copy(stockAt);
    cart(X + 1.6); var dropped = [];
    stations.push({
      x: X, name: '生産ライン横の部品供給',
      run: function () {
        drive(X - 1.6);
        pick(function () { return stock; }, function () { return stockAt.clone(); },
          function () { stock = crate(C.full); scene.add(stock); stock.position.copy(stockAt); });
        drive(X);
        until(function () { return sup.length < 3; });
        place(function () { return V3(X, SUP + 0.075, RZ + 0.39); }, function (o) { sup.push(o); });
        call(function () {                // 返却段に空箱が来ていれば回収する
          var e = ret[0];
          if (!e || Math.abs(e.position.z - laneZ('ret', 0)) > 0.02) return;
          pick(function () { return ret[0]; }, function () { return ret[0].position.clone(); }, function () { ret.shift(); });
          drive(X + 1.6);
          place(function () { return V3(X + 1.6 + (dropped.length % 2 ? 0.2 : -0.2), 0.87, -0.75); }, function (o) {
            dropped.push(o); if (dropped.length > 2) scene.remove(dropped.shift());
          });
        });
      },
      tick: function (dt) {
        cars.forEach(function (c) { c.position.x += dt * 0.22; if (c.position.x > -6.8) c.position.x -= 10.9; });
        sup.forEach(function (c, i) { c.position.z += clamp(laneZ('sup', i) - c.position.z, -dt * 0.6, dt * 0.6); });
        ret.forEach(function (c, i) { c.position.z += clamp(laneZ('ret', i) - c.position.z, -dt * 0.6, dt * 0.6); });
        if (anim) {                        // 作業者：先頭の箱を使い切ったら、空箱を上の返却段へ
          anim.t += dt; var p = Math.min(1, anim.t / 1.4);
          w.reach(Math.sin(p * Math.PI)); anim.c.position.lerpVectors(anim.a, anim.b, ease(p));
          if (p >= 1) { ret.push(anim.c); anim = null; timer = 7 + Math.random() * 3; }
        } else if ((timer -= dt) <= 0 && sup.length > 1 && Math.abs(sup[0].position.z - laneZ('sup', 0)) < 0.02 && ret.length < 2) {
          var c = sup.shift(); c.userData.setColor(C.empty);
          anim = { t: 0, c: c, a: c.position.clone(), b: V3(X, RET + 0.075, laneZ('ret', 1)) };
        } else w.reach(0);
        lamps.forEach(function (m, i) { m.emissiveIntensity = (i + Math.floor(clock / 2)) % 8 === 0 ? 1 : 0.5; });
      },
      reset: function () {}
    });
  })();

  /* 2. 研削・切削設備への部品の着脱：扉を開けて加工済みを取り出し、次を入れる */
  (function () {
    var X = -6, TABLE = 0.86;
    var g = new THREE.Group(); g.position.set(X, 0, -1.0); scene.add(g);
    var body = mat('#e3e8ec'), trim = mat('#0b4f8f');
    box(g, 1.7, 0.75, 1.3, body, 0, 0.375, 0); box(g, 1.7, 0.55, 1.3, body, 0, 1.775, 0);
    box(g, 0.45, 0.7, 1.3, body, -0.625, 1.15, 0); box(g, 0.45, 0.7, 1.3, body, 0.625, 1.15, 0);
    box(g, 1.72, 0.08, 1.32, trim, 0, 2.0, 0);
    box(g, 0.8, 0.02, 0.6, '#9aa5ae', 0, TABLE - 0.01, 0.2);
    box(g, 0.28, 0.4, 0.06, '#2b3135', 0.62, 1.25, 0.66);
    var door = box(g, 0.82, 0.7, 0.03, new THREE.MeshStandardMaterial({ color: '#9fc3e0', transparent: true, opacity: 0.55 }), 0, 1.15, 0.64);
    var lamp = [['#e0302a', 2.42], ['#f2c230', 2.3], ['#3EB370', 2.18]].map(function (l) {
      var m = new THREE.MeshStandardMaterial({ color: l[0], emissive: l[0], emissiveIntensity: 0.05 });
      var c = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.11, 16), m); c.position.set(0.7, l[1], 0.45); g.add(c); return m;
    });
    cyl(g, 0.015, 0.12, '#8b98a4', 0.7, 2.06, 0.45, 'y');
    shade(g);
    var IN = V3(X, TABLE + 0.05, -0.8);
    var m = { open: 0, doneAt: 0, part: part(DONE) }; scene.add(m.part); m.part.position.copy(IN);
    cart(X - 1.6); cart(X + 1.6);
    var raw = row(X - 1.6, -0.75, 0.85, function () { return part(RAW); }, 3), out = [];
    stations.push({
      x: X, name: '研削・切削設備への部品の着脱',
      run: function () {
        drive(X - 1.6);
        pick(function () { return raw[0]; }, function () { return raw[0].position.clone(); }, function () { onDeck.raw = raw.take(); });
        place(function () { return deckW('raw'); }, null, true);
        drive(X);
        until(function () { return clock >= m.doneAt; });
        act({ dur: 0.7, update: function (p) { m.open = p; } });
        pick(function () { return m.part; }, function () { return IN.clone(); });
        place(function () { return deckW('done'); }, function (o) { onDeck.done = o; }, true);
        pick(function () { return onDeck.raw; }, function () { return deckW('raw'); });
        place(function () { return IN.clone(); }, function (o) { m.part = o; });
        act({ dur: 0.7, update: function (p) { m.open = 1 - p; } });
        call(function () { m.doneAt = clock + 18; m.part.userData.finishAt = m.doneAt; });
        drive(X + 1.6);
        pick(function () { return onDeck.done; }, function () { return deckW('done'); });
        place(function () { return V3(X + 1.6 + ((out.length % 3) - 1) * 0.28, 0.85, -0.75); }, function (o) {
          out.push(o); if (out.length > 3) scene.remove(out.shift());
        });
      },
      tick: function () {
        door.position.y = 1.15 + m.open * 0.62;
        var run = clock < m.doneAt;
        lamp[2].emissiveIntensity = run ? 1 : 0.05;
        lamp[1].emissiveIntensity = run ? 0.05 : (Math.floor(clock * 2) % 2 ? 1 : 0.3);
        if (!run && m.part.userData.finishAt) { m.part.children[0].material = doneMat(); m.part.userData.finishAt = 0; }
      },
      reset: function () { m.open = 0; }
    });
  })();

  /* 3. 板金部品の溶接工程への部品設置：治具に置くと、溶接ロボットが溶接する */
  (function () {
    var X = 0, JZ = -0.85;
    var fence = new THREE.MeshStandardMaterial({ color: '#c9d0d6', transparent: true, opacity: 0.35, side: THREE.DoubleSide });
    var post = mat('#f2c230');
    [[-1.6, -0.5], [-1.6, -2.9], [1.6, -2.9], [1.6, -0.5]].forEach(function (p) { box(scene, 0.06, 1.8, 0.06, post, X + p[0], 0.9, p[1]); });
    [[-1.6, -1.7, 2.4, 'z'], [1.6, -1.7, 2.4, 'z'], [0, -2.9, 3.2, 'x']].forEach(function (p) {
      var w = p[3] === 'x' ? p[2] : 0.02, d = p[3] === 'z' ? p[2] : 0.02;
      box(scene, w, 1.5, d, fence, X + p[0], 0.95, p[1]);
      box(scene, p[3] === 'x' ? p[2] : 0.04, 0.04, p[3] === 'z' ? p[2] : 0.04, post, X + p[0], 1.72, p[1]);
    });
    [-1, 1].forEach(function (s) {                                       // 入口の光の柵
      box(scene, 0.07, 1.4, 0.07, '#2b3135', X + s * 0.8, 0.7, -0.45);
      box(scene, 0.03, 1.2, 0.02, new THREE.MeshStandardMaterial({ color: '#f2c230', emissive: '#f2c230', emissiveIntensity: 0.5 }), X + s * 0.8, 0.75, -0.41);
    });
    var tbl = new THREE.Group(); tbl.position.set(X, 0, JZ); scene.add(tbl);
    box(tbl, 0.9, 0.8, 0.6, '#5b6670', 0, 0.4, 0);
    [-0.25, 0.25].forEach(function (dx) { box(tbl, 0.05, 0.08, 0.05, '#e5832d', dx, 0.84, -0.18); box(tbl, 0.05, 0.08, 0.05, '#e5832d', dx, 0.84, 0.18); });
    shade(tbl);
    shade(box(scene, 0.45, 0.5, 0.45, '#5b6670', X, 0.25, -2.05));
    var wr = new THREE.Group(); scene.add(wr);
    var warm = M.makeArm(wr, { body: '#f08a24', ring: '#3a4148', tool: '#3a4148', L1: 0.75, L2: 0.75 }, V3(X, 0.5, -2.05)); shade(wr);
    var wHome = V3(X, 1.55, -1.75);
    var spark = new THREE.PointLight('#bfe2ff', 0, 3); scene.add(spark);
    var sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(60), 3));
    var sparks = new THREE.Points(sg, new THREE.PointsMaterial({ color: '#ffd27a', size: 0.04 })); sparks.visible = false; scene.add(sparks);
    var plate = function () {
      var p = new THREE.Group(); box(p, 0.42, 0.04, 0.3, '#b9c2c9', 0, 0, 0, { metalness: 0.6, roughness: 0.35 });
      p.userData = { size: { x: 0.42, y: 0.04, z: 0.3 } }; return shade(p);
    };
    cart(X + 1.9); cart(X - 1.9);
    var plates = row(X + 1.9, -0.75, 0.82, plate, 2), out = [], onJig = null;
    var weld = { t: -1 };                  // t：溶接を始めてからの秒数（-1 は止まっている）
    warm.ik(wHome, true);
    stations.push({
      x: X, name: '板金部品の溶接工程への部品設置',
      run: function () {
        drive(X + 1.9);
        pick(function () { return plates[0]; }, function () { return plates[0].position.clone(); }, function () { plates.take(); });
        drive(X);
        place(function () { return V3(X, 0.88, JZ); }, function (o) { onJig = o; });
        call(function () { weld.t = 0; });
        until(function () { return weld.t < 0; });
        pick(function () { return onJig; }, function () { return V3(X, 0.88, JZ); });
        drive(X - 1.9);
        place(function () { return V3(X - 1.9 + ((out.length % 2) ? 0.2 : -0.2), 0.82, -0.75); }, function (o) {
          out.push(o); if (out.length > 2) scene.remove(out.shift());
        });
      },
      tick: function (dt) {
        if (weld.t < 0) { warm.ik(wHome, true); spark.intensity = 0; sparks.visible = false; return; }
        weld.t += dt;
        var T = weld.t, on = T > 1.2 && T < 4.2, s = T < 1.2 ? T / 1.2 : T < 4.2 ? 1 : 1 - (T - 4.2) / 1.2;
        var seam = V3(X - 0.16 + 0.32 * clamp((T - 1.2) / 3, 0, 1), 0.92, JZ);
        warm.ik(wHome.clone().lerp(seam.clone().add(V3(0, 0.05, -0.2)), ease(s)), true);
        spark.intensity = on ? 0.8 + Math.random() * 1.4 : 0; spark.position.copy(seam).add(V3(0, 0.1, 0));
        sparks.visible = on;
        if (on) {
          var a = sg.attributes.position.array;
          for (var k = 0; k < 20; k++) { a[k * 3] = seam.x + (Math.random() - 0.5) * 0.25; a[k * 3 + 1] = seam.y + Math.random() * 0.2; a[k * 3 + 2] = seam.z + (Math.random() - 0.5) * 0.25; }
          sg.attributes.position.needsUpdate = true;
          if (onJig && !onJig.userData.seam) onJig.userData.seam = box(onJig, 0.32, 0.012, 0.02, '#4a3a2a', 0, 0.026, 0);   // 溶接した跡
        }
        if (T > 5.4) weld.t = -1;
      },
      reset: function () { weld.t = -1; }
    });
  })();

  /* 4. 検査機への部品投入と検査記録：トレイに置くと中で検査し、画面に結果と記録の数が出る */
  (function () {
    var X = 6, TRAY_OUT = -0.5, TRAY_IN = -1.05;
    var g = new THREE.Group(); g.position.set(X, 0, -1.05); scene.add(g);
    var body = mat('#eef1f3'), trim = mat('#0b4f8f');
    box(g, 1.3, 0.8, 1.0, body, 0, 0.4, 0);
    box(g, 1.3, 0.55, 1.0, body, 0, 1.825, 0);
    [-0.6, 0.6].forEach(function (dx) { box(g, 0.1, 0.75, 1.0, body, dx, 1.175, 0); });
    box(g, 1.32, 0.06, 1.02, trim, 0, 2.12, 0);
    box(g, 0.2, 0.1, 0.2, '#1d2226', 0, 1.5, 0);
    var ringM = new THREE.MeshStandardMaterial({ color: '#5AA0DC', emissive: '#5AA0DC', emissiveIntensity: 0.2 });
    var ring = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.015, 8, 24), ringM); ring.rotation.x = Math.PI / 2; ring.position.set(0, 1.44, 0); g.add(ring);
    shade(g);
    var tray = box(scene, 0.5, 0.02, 0.4, '#9aa5ae', X, 0.82, TRAY_OUT); shade(tray);
    var cv = document.createElement('canvas'); cv.width = 256; cv.height = 128;
    var tex = new THREE.CanvasTexture(cv);
    var screen = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.31), new THREE.MeshBasicMaterial({ map: tex }));
    screen.position.set(X, 1.83, -0.54); scene.add(screen);
    var records = 0;
    function draw(state) {
      var x2 = cv.getContext('2d');
      x2.fillStyle = '#10202e'; x2.fillRect(0, 0, 256, 128);
      x2.textAlign = 'center'; x2.textBaseline = 'middle';
      x2.fillStyle = state === 'ok' ? '#3EB370' : state === 'scan' ? '#5AA0DC' : '#8b98a4';
      x2.font = '700 46px sans-serif'; x2.fillText(state === 'ok' ? 'OK' : state === 'scan' ? '検査中' : '待機', 128, 50);
      x2.fillStyle = '#d5dee6'; x2.font = '700 24px sans-serif'; x2.fillText('記録 ' + records + ' 件', 128, 100);
      tex.needsUpdate = true;
    }
    draw('idle');
    cart(X - 1.6); cart(X + 1.6);
    var parts = row(X - 1.6, -0.75, 0.85, function () { return part(DONE); }, 3), out = [], onTray = null;
    var insp = { t: -1, drawn: 0 };
    stations.push({
      x: X, name: '検査機への部品投入と検査記録',
      run: function () {
        drive(X - 1.6);
        pick(function () { return parts[0]; }, function () { return parts[0].position.clone(); }, function () { parts.take(); });
        drive(X);
        place(function () { return V3(X, 0.88, TRAY_OUT); }, function (o) { onTray = o; });
        call(function () { insp.t = 0; });
        until(function () { return insp.t < 0; });
        pick(function () { return onTray; }, function () { return V3(X, 0.88, TRAY_OUT); });
        drive(X + 1.6);
        place(function () { return V3(X + 1.6 + ((out.length % 3) - 1) * 0.28, 0.85, -0.75); }, function (o) {
          out.push(o); if (out.length > 3) scene.remove(out.shift());
        });
      },
      tick: function (dt) {
        ringM.emissiveIntensity = 0.2;
        if (insp.t < 0) return;
        var T = (insp.t += dt), z;
        if (T < 0.9) z = TRAY_OUT + (TRAY_IN - TRAY_OUT) * ease(T / 0.9);
        else if (T < 3.0) { z = TRAY_IN; ringM.emissiveIntensity = 0.6 + 0.6 * Math.sin(T * 12); if (!insp.drawn) { draw('scan'); insp.drawn = 1; } }
        else if (T < 3.9) { if (insp.drawn === 1) { records++; draw('ok'); insp.drawn = 2; } z = TRAY_IN + (TRAY_OUT - TRAY_IN) * ease((T - 3.0) / 0.9); }
        else { z = TRAY_OUT; insp.t = -1; insp.drawn = 0; }
        tray.position.z = z; if (onTray) onTray.position.z = z;
      },
      reset: function () { insp.t = -1; insp.drawn = 0; tray.position.z = TRAY_OUT; }
    });
  })();

  /* 5. 完成部品の箱詰め：台の上の完成品を、通い箱に並べて詰める */
  (function () {
    var X = 12, BZ = -0.85;
    [X, X + 1.6].forEach(function (x) {
      var t = new THREE.Group(); t.position.set(x, 0, BZ); scene.add(t);
      box(t, 1.0, 0.04, 0.7, '#c9d0d6', 0, 0.78, 0);
      [-1, 1].forEach(function (sx) { [-1, 1].forEach(function (sz) { box(t, 0.04, 0.78, 0.04, '#8b98a4', sx * 0.46, 0.39, sz * 0.31); }); });
      shade(t);
    });
    var bin = null, k = 0, packed = [];
    var SLOT = [[-0.15, -0.1], [0.15, -0.1], [-0.15, 0.1], [0.15, 0.1]];
    function newBin() { bin = crate('#2f6fb3', { x: 0.66, y: 0.2, z: 0.46 }); bin.position.set(X, 0.9, BZ); scene.add(bin); k = 0; packed = []; }
    newBin();
    var parts = row(X + 1.6, BZ, 0.85, function () { return part(DONE); }, 3);
    function one() {
      drive(X + 1.6);
      pick(function () { return parts[0]; }, function () { return parts[0].position.clone(); }, function () { parts.take(); });
      drive(X);
      place(function () { var s = SLOT[k]; return V3(X + s[0], 0.86, BZ + s[1]); }, function (o) { packed.push(o); k++; });
      call(function () {
        if (k < SLOT.length) return;
        var full = bin, items = packed;           // 満杯になった箱は奥へ送り、空の箱を出す
        act({ dur: 1.6, update: function (p) { var dz = -ease(p) * 1.2; full.position.z = BZ + dz; items.forEach(function (o, i) { o.position.z = BZ + SLOT[i][1] + dz; }); } });
        call(function () { scene.remove(full); items.forEach(function (o) { scene.remove(o); }); newBin(); });
      });
    }
    stations.push({ x: X, name: '完成部品の箱詰め', run: function () { one(); one(); }, tick: function () {}, reset: function () {} });
  })();

  /* 順番に回る（端まで行ったら折り返す） */
  var order = [0, 1, 2, 3, 4, 3, 2, 1], at = 0, now = 0;
  function visit(i) { now = i; ui.station(i); stations[i].run(); }
  script = function () { visit(order[at % order.length]); at++; };
  bot.x = stations[0].x - 1.6;
  var sim = { tick: function (dt) { stations.forEach(function (s) { s.tick(dt); }); } };
  // カメラはいまの作業場所を正面から。作業場所が変わると横へ流れる（pts は target からの相対位置）
  var view = { target: V3(stations[0].x, 0.8, -1.1), az: 0.3, el: 0.55, pts: [] };
  [-2.4, 2.4].forEach(function (x) { [-1.6, 1.6].forEach(function (z) { [-0.8, 1.3].forEach(function (y) { view.pts.push(V3(x, y, z)); }); }); });
  function jump(i) {                      // ボタンで選んだ作業場所から始める
    queue = []; cur = null;
    if (bot.held) { scene.remove(bot.held); bot.held = null; }
    R.g.children.filter(function (o) { return o.userData && o.userData.size; }).forEach(function (o) { R.g.remove(o); });
    onDeck = {};
    stations.forEach(function (s) { s.reset(); });
    bot.wristL.copy(HOME); bot.open = 1;
    bot.x = bot.lastX = stations[i].x + (stations[i].x > bot.x ? -2.5 : 2.5);
    at = order.indexOf(i) + 1;
    visit(i);
  }

  /* ---------------- カメラ（ドラッグで回せる） ---------------- */
  var dist = 10;
  function placeCam() {
    var d = V3(Math.sin(view.az) * Math.cos(view.el), Math.sin(view.el), Math.cos(view.az) * Math.cos(view.el));
    camera.position.copy(view.target).addScaledVector(d, dist); camera.lookAt(view.target);
  }
  function fit() {                        // 作業場所の要所がすべて入る、いちばん近い距離
    for (dist = 3; dist < 80; dist *= 1.03) {
      placeCam(); camera.updateMatrixWorld(true);
      if (view.pts.every(function (p) { var q = p.clone().add(view.target).project(camera); return q.z < 1 && Math.abs(q.x) < 0.98 && q.y < 0.9 && q.y > -0.55; })) break;   // 下は作業名の帯の分あける
    }
  }
  function resize() {
    var w = host.clientWidth || 300, h = host.clientHeight || 200;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%';
    camera.aspect = w / h; camera.updateProjectionMatrix(); fit();
  }
  var drag = null, az0 = view.az;
  renderer.domElement.style.touchAction = 'pan-y';
  renderer.domElement.addEventListener('pointerdown', function (e) { drag = { x: e.clientX, az: view.az }; });
  window.addEventListener('pointermove', function (e) { if (drag) { view.az = clamp(drag.az - (e.clientX - drag.x) * 0.006, az0 - 1.1, az0 + 1.1); placeCam(); render(); } });
  window.addEventListener('pointerup', function () { drag = null; });
  if (window.ResizeObserver) new ResizeObserver(function () { resize(); render(); }).observe(host);

  function render() { renderer.render(scene, camera); }
  resize();
  poseBot(); render();

  return {
    names: stations.map(function (s) { return s.name; }),
    jump: jump,
    tick: function (dt) {
      dt = Math.min(dt, 0.1);
      clock += dt;
      stepBot(dt); sim.tick(dt); poseBot();
      view.target.x += (stations[now].x - view.target.x) * Math.min(1, dt * 2);   // 作業場所へ横に流れる
      placeCam(); render();
    }
  };
};
