/* 使いどころの 3D シミュレーション（自動車工場でよく見る景色の中で、LexxMoMa が作業をくり返す）。
   見た目は shooter-concept.html（方眼の床・通路の青・作業域の緑・Φ28パイプの棚）に合わせています。
   機体の形は moma-model.js（先に読み込む）。
   使い方：var s = FactoryScene(要素, 'supply' | 'machine' | 'kit', { cap: 文字を出す関数, count: 数を出す関数 }); s.tick(秒) */
window.FactoryScene = function (host, kind, ui) {
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
  var queue = [], cur = null, script = null;
  function act(o) { queue.push(Object.assign({ dur: 0 }, o)); }
  function drive(x, cap) {
    act({ start: function () { this.x0 = bot.x; this.dur = Math.abs(x - this.x0) / 1.3 + 0.8; if (cap) ui.cap(cap); },
          update: function (p) { bot.x = this.x0 + (x - this.x0) * ease(p); } });
  }
  function armTo(fn, dur) {               // fn：手首の目標（ワールド座標）を返す関数、または台車の上での決まった姿勢
    act({ dur: dur || 0.9, start: function () { this.a = bot.wristL.clone(); this.b = fn.isVector3 ? fn.clone() : R.g.worldToLocal(fn()); },
          update: function (p) { bot.wristL.copy(this.a).lerp(this.b, ease(p)); } });
  }
  function grip(open) { act({ dur: 0.35, start: function () { this.a = bot.open; }, update: function (p) { bot.open = this.a + (open - this.a) * p; } }); }
  function call(fn) { act({ start: fn }); }
  function wait(sec) { act({ dur: sec }); }
  function until(cond, cap) { act({ dur: 1e9, until: cond, start: function () { if (cap) ui.cap(cap); } }); }
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

  /* ---------------- 使いどころごとの景色と台本 ---------------- */
  var view = { target: V3(0.6, 0.6, -1), az: 0.28, el: 0.6, pts: [] };
  var sim = { tick: function () {} };
  var count = 0;

  if (kind === 'supply') {
    /* A：ライン脇の棚（シューター）へ部品箱を補充し、空箱を回収する */
    floor(-7, 9, -4.6, 3);
    zone(-7, 9, -1.95, -0.6, C.green, 0.12);              // 作業者の域
    zone(-7, 9, 0.62, 1.55, '#5AA0DC', 0.14);             // LexxMoMa の通路
    tape(-7, 9, -1.95); tape(-7, 9, 0.62); tape(-7, 9, 1.55);
    box(scene, 16, 0.25, 2.1, '#cfd6dc', 1, 0.125, -2.95); // コンベヤ
    for (var k = 0; k < 16; k++) box(scene, 0.04, 0.02, 2.1, '#b8c2ca', -7 + k + 0.5, 0.26, -2.95);
    var cars = [-4.5, 1.2, 6.9].map(function (x) { var c = car('#f4f5f6'); c.position.set(x, 0.25, -2.95); scene.add(c); return c; });
    var lamps = andon(1, -2.95, 4.2);
    pillar(-6.3, -1.3, 'C11'); pillar(8.3, -1.3, 'C12');
    var SX = [-2.6, 0, 2.6], SUP = 0.86, RET = 1.38;
    var racks = SX.map(function (x, i) {
      var g = new THREE.Group(); g.position.set(x, 0, 0); scene.add(g);
      pipeRack(g, 0.86, 1.1, 1.62);
      [[SUP - 0.03, -0.04], [RET - 0.03, 0.04]].forEach(function (lv) {   // ローラー段（ライン側へ／通路側へ少し傾く）
        var p = box(g, 0.8, 0.02, 1.1, '#c5cdd3', 0, lv[0], 0); p.rotation.x = lv[1];
      });
      box(g, 0.86, 0.5, 0.01, '#eef2f5', 0, 0.3, -0.55);    // ライン側の下の閉じ板
      shade(g);
      var r = { x: x, sup: [], ret: [], w: worker(x, -1.15, 0), timer: 3 + i * 4.5, anim: null };
      for (var n = 0; n < 2; n++) { var c = crate(C.full); scene.add(c); r.sup.push(c); c.position.set(x, SUP + 0.075, -0.33 + n * 0.36); }
      return r;
    });
    var supplyRack = new THREE.Group(); supplyRack.position.set(5.0, 0, 0); scene.add(supplyRack);
    pipeRack(supplyRack, 0.86, 0.9, 1.2); box(supplyRack, 0.8, 0.02, 0.9, '#c5cdd3', 0, SUP - 0.03, 0); shade(supplyRack);
    var stock = crate(C.full); scene.add(stock); stock.position.set(5.0, SUP + 0.075, 0.1);
    var emptyCart = new THREE.Group(); emptyCart.position.set(6.3, 0, 0.3); scene.add(emptyCart);
    box(emptyCart, 0.8, 0.03, 0.7, '#8b98a4', 0, 0.42, 0); [-1, 1].forEach(function (s) { box(emptyCart, 0.03, 0.42, 0.03, '#8b98a4', s * 0.38, 0.21, 0.32); box(emptyCart, 0.03, 0.42, 0.03, '#8b98a4', s * 0.38, 0.21, -0.32); }); shade(emptyCart);
    var dropped = [];
    var laneZ = function (lane, i) { return lane === 'sup' ? -0.33 + i * 0.36 : 0.33 - i * 0.36; };
    bot.x = 5.6; bot.z = 1.0;
    var trip = 0, delivered = 0;
    script = function () {
      var r = racks[trip % 3]; trip++;
      ui.cap('置き場で部品箱を取る');
      pick(function () { return stock; }, function () { return stock.position.clone(); },
        function () { stock = crate(C.full); scene.add(stock); stock.position.set(5.0, SUP + 0.075, 0.1); stock.visible = false; });
      call(function () { stock.visible = true; });
      drive(r.x, 'ライン脇の棚へ');
      until(function () { return r.sup.length < 3; });
      call(function () { ui.cap('棚の奥から箱を入れる'); });
      place(function () { return V3(r.x, SUP + 0.075, 0.42); }, function (o) { r.sup.push(o); delivered++; ui.count('補充 ' + delivered + '箱'); });
      call(function () {                  // 返却段に空箱が来ていれば回収してから戻る
        var e = r.ret[0], ready = e && Math.abs(e.position.z - laneZ('ret', 0)) < 0.02;
        if (ready) {
          ui.cap('空箱を回収する');
          pick(function () { return r.ret[0]; }, function () { return r.ret[0].position.clone(); }, function () { r.ret.shift(); });
          drive(5.6, '空箱を戻す');
          place(function () { return V3(6.3, 0.52, 0.3 + (dropped.length % 2 ? 0.15 : -0.15)); }, function (o) {
            dropped.push(o); if (dropped.length > 2) scene.remove(dropped.shift());
          });
        } else drive(5.6, '置き場へ戻る');
      });
    };
    sim.tick = function (dt) {
      cars.forEach(function (c) { c.position.x += dt * 0.22; if (c.position.x > 9.5) c.position.x -= 17.1; });
      racks.forEach(function (r) {
        r.sup.forEach(function (c, i) { var z = laneZ('sup', i); c.position.z += clamp(z - c.position.z, -dt * 0.6, dt * 0.6); });
        r.ret.forEach(function (c, i) { var z = laneZ('ret', i); c.position.z += clamp(z - c.position.z, -dt * 0.6, dt * 0.6); });
        // 作業者：先頭の箱の部品を使い切ったら、空箱を上の返却段へ
        if (r.anim) {
          r.anim.t += dt; var p = Math.min(1, r.anim.t / 1.4);
          r.w.reach(Math.sin(p * Math.PI));
          r.anim.c.position.lerpVectors(r.anim.a, r.anim.b, ease(p));
          if (p >= 1) { r.ret.push(r.anim.c); r.anim = null; r.timer = 9 + Math.random() * 4; }
        } else if ((r.timer -= dt) <= 0 && r.sup.length && Math.abs(r.sup[0].position.z - laneZ('sup', 0)) < 0.02 && r.ret.length < 2) {
          var c = r.sup.shift(); c.userData.setColor(C.empty);
          r.anim = { t: 0, c: c, a: c.position.clone(), b: V3(r.x, RET + 0.075, -0.33) };
        } else r.w.reach(0);
      });
      lamps.forEach(function (m, i) { var on = (i + Math.floor(clock / 2)) % 8 === 0; m.emissiveIntensity = on ? 1 : 0.5; });
    };
    view = { target: V3(1.3, 0.7, -0.9), az: 0.3, el: 0.62, pts: [] };
    [-3.3, 6.7].forEach(function (x) { [-3.0, 1.45].forEach(function (z) { [0, 1.8].forEach(function (y) { view.pts.push(V3(x, y, z)); }); }); });
    ui.count('補充 0箱');
  }

  if (kind === 'machine') {
    /* B：加工機・検査機へ材料を入れ、終わったものを取り出す */
    floor(-7, 7, -2.8, 2.6);
    zone(-7, 7, -0.25, 0.95, '#5AA0DC', 0.14);
    tape(-7, 7, -0.25); tape(-7, 7, 0.95);
    pillar(-6.2, -1.6, 'D04'); pillar(6.2, -1.6, 'D05');
    var MX = [-2.4, 0, 2.4], TABLE = 0.86;
    var machines = MX.map(function (x, i) {
      var g = new THREE.Group(); g.position.set(x, 0, -1.0); scene.add(g);
      var body = mat('#e3e8ec'), trim = mat('#0b4f8f');
      box(g, 1.7, 0.75, 1.3, body, 0, 0.375, 0);                 // 下
      box(g, 1.7, 0.55, 1.3, body, 0, 1.775, 0);                 // 上
      box(g, 0.45, 0.7, 1.3, body, -0.625, 1.15, 0);              // 左右の柱
      box(g, 0.45, 0.7, 1.3, body, 0.625, 1.15, 0);
      box(g, 1.72, 0.08, 1.32, trim, 0, 2.0, 0);
      box(g, 0.8, 0.02, 0.6, '#9aa5ae', 0, TABLE - 0.01, 0.2);    // 中の台
      box(g, 0.28, 0.4, 0.06, '#2b3135', 0.62, 1.25, 0.66);       // 操作盤
      var door = box(g, 0.82, 0.7, 0.03, new THREE.MeshStandardMaterial({ color: '#9fc3e0', transparent: true, opacity: 0.55 }), 0, 1.15, 0.64);
      var lamp = [['#e0302a', 2.42], ['#f2c230', 2.3], ['#3EB370', 2.18]].map(function (l) {
        var m = new THREE.MeshStandardMaterial({ color: l[0], emissive: l[0], emissiveIntensity: 0.05 });
        var c = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.11, 16), m); c.position.set(0.7, l[1], 0.45); g.add(c); return m;
      });
      cyl(g, 0.015, 0.12, '#8b98a4', 0.7, 2.06, 0.45, 'y');
      shade(g);
      var p = part('#a9bfd0'); scene.add(p); p.position.set(x, TABLE + 0.05, -0.8);
      return { x: x, door: door, lamp: lamp, part: p, doneAt: [0, 7, 13][i], open: 0 };
    });
    function cart(x, color) {
      var g = new THREE.Group(); g.position.set(x, 0, -0.75); scene.add(g);
      box(g, 0.9, 0.03, 0.6, '#8b98a4', 0, 0.78, 0); box(g, 0.9, 0.03, 0.6, '#8b98a4', 0, 0.3, 0);
      [-1, 1].forEach(function (sx) { [-1, 1].forEach(function (sz) { box(g, 0.03, 0.8, 0.03, '#8b98a4', sx * 0.43, 0.4, sz * 0.28); }); });
      return shade(g);
    }
    cart(-4.7); cart(4.7);
    var inParts = [], outParts = [];
    for (var n = 0; n < 3; n++) { var q = part('#5b6670'); scene.add(q); q.position.set(-4.7 + (n - 1) * 0.28, 0.85, -0.75); inParts.push(q); }
    box(R.g, 0.36, 0.02, 0.5, '#9aa5ae', -0.22, 0.905, 0.0);       // 台車の上の置き台
    var DECK = { raw: V3(-0.22, 0.965, 0.13), done: V3(-0.22, 0.965, -0.13) };
    var deckW = function (k) { return R.g.localToWorld(DECK[k].clone()); };
    bot.x = -4.7; bot.z = 0.1;
    var served = 0, made = 0, onDeck = {};
    script = function () {
      var m = machines.slice().sort(function (a, b) { return a.doneAt - b.doneAt; })[0];
      drive(-4.7, '材料を取る');
      pick(function () { return inParts[0]; }, function () { return inParts[0].position.clone(); }, function () {
        var used = inParts.shift();
        var q = part('#5b6670'); scene.add(q); inParts.push(q);
        inParts.forEach(function (o, i) { o.position.set(-4.7 + (i - 1) * 0.28, 0.85, -0.75); });
        onDeck.raw = used;
      });
      place(function () { return deckW('raw'); }, null, true);
      drive(m.x, '終わる設備へ向かう');
      until(function () { return clock >= m.doneAt; }, '加工の終わりを待つ');
      act({ dur: 0.7, start: function () { ui.cap('扉を開けて、加工済みを取り出す'); }, update: function (p) { m.open = p; } });
      pick(function () { return m.part; }, function () { return m.part.position.clone(); });
      place(function () { return deckW('done'); }, function (o) { onDeck.done = o; }, true);
      call(function () { ui.cap('材料を入れる'); });
      pick(function () { return onDeck.raw; }, function () { return deckW('raw'); });
      place(function () { return V3(m.x, TABLE + 0.05, -0.8); }, function (o) { m.part = o; });
      act({ dur: 0.7, update: function (p) { m.open = 1 - p; }, start: function () {} });
      call(function () { m.doneAt = clock + 26; served++; ui.count('入れ替え ' + served + '回'); m.part.userData.goldAt = m.doneAt; });
      drive(4.7, '加工済みを置き場へ');
      pick(function () { return onDeck.done; }, function () { return deckW('done'); });
      place(function () { return V3(4.7 + ((made % 3) - 1) * 0.28, 0.85, -0.75); }, function (o) {
        outParts.push(o); made++; if (outParts.length > 3) scene.remove(outParts.shift());
      });
    };
    sim.tick = function () {
      machines.forEach(function (m) {
        m.door.position.y = 1.15 + m.open * 0.62;
        var run = clock < m.doneAt;
        m.lamp[2].emissiveIntensity = run ? 1 : 0.05;     // 緑：加工中
        m.lamp[1].emissiveIntensity = run ? 0.05 : (Math.floor(clock * 2) % 2 ? 1 : 0.3);   // 黄色の点滅：終わった
        if (!run && m.part.userData.goldAt) { m.part.children[0].material = mat('#a9bfd0', { metalness: 0.5, roughness: 0.35 }); m.part.userData.goldAt = 0; }
      });
    };
    view = { target: V3(0, 0.8, -0.6), az: 0.22, el: 0.5, pts: [] };
    [-5.4, 5.4].forEach(function (x) { [-1.8, 1.2].forEach(function (z) { [0, 2.5].forEach(function (y) { view.pts.push(V3(x, y, z)); }); }); });
    ui.count('入れ替え 0回');
  }

  if (kind === 'kit') {
    /* C：人のいない時間に、倉庫の棚から翌日分の部品箱を台車にそろえる */
    scene.background = new THREE.Color('#dde4ea');
    floor(-6, 7.5, -2.4, 2.4);
    zone(-6, 7.5, -0.5, 0.55, '#5AA0DC', 0.14);
    tape(-6, 7.5, -0.5); tape(-6, 7.5, 0.55);
    pillar(-5.5, -1.7, 'F02');
    var LV = [0.32, 0.82, 1.32], colors = ['#2f6fb3', '#3C9A5F', '#E58F26', '#3570B0', '#22558C'];
    var slots = [];
    [-3.4, -1.0].forEach(function (rx) {          // 倉庫の棚（青い柱・橙の梁）
      var g = new THREE.Group(); g.position.set(rx, 0, -0.95); scene.add(g);
      [-1.1, 1.1].forEach(function (dx) { [-0.28, 0.28].forEach(function (dz) { box(g, 0.07, 1.75, 0.07, '#2c5d9e', dx, 0.875, dz); }); });
      LV.forEach(function (y) { [-0.28, 0.28].forEach(function (dz) { box(g, 2.27, 0.07, 0.05, '#e5832d', 0, y - 0.04, dz); }); box(g, 2.2, 0.015, 0.56, '#c9d0d6', 0, y - 0.005, 0); });
      shade(g);
      LV.forEach(function (y, li) { [-0.75, -0.25, 0.25, 0.75].forEach(function (dx, si) {
        var c = crate(colors[(li * 4 + si + (rx > -2 ? 2 : 0)) % colors.length]); scene.add(c);
        c.position.set(rx + dx, y + 0.075, -0.85); slots.push({ c: c, home: c.position.clone() });
      }); });
    });
    var KX = 4.6, kitSlots = [];
    [0.45, 0.95].forEach(function (y) { [-0.36, 0, 0.36].forEach(function (dx) { kitSlots.push(V3(dx, y + 0.09, 0)); }); });
    function kitCart() {
      var g = new THREE.Group(); scene.add(g);
      [0.45, 0.95].forEach(function (y) { box(g, 1.15, 0.03, 0.6, '#8b98a4', 0, y, 0); });
      [-1, 1].forEach(function (sx) { [-1, 1].forEach(function (sz) { box(g, 0.03, 1.15, 0.03, '#8b98a4', sx * 0.56, 0.575, sz * 0.28); cyl(g, 0.05, 0.04, '#2b3135', sx * 0.5, 0.05, sz * 0.24, 'z'); }); });
      box(g, 0.03, 0.03, 0.6, '#8b98a4', 0.6, 1.0, 0);
      return shade(g);
    }
    var kc = kitCart(); kc.position.set(KX, 0, -0.95);
    var filled = [], done = 0, order = [];
    bot.x = KX - 1.2; bot.z = 0.0;
    script = function () {
      if (!order.length) order = slots.map(function (s, i) { return i; }).sort(function () { return Math.random() - 0.5; }).slice(0, 6);
      var s = slots[order.shift()];
      var k = filled.length;
      drive(s.home.x, '棚から部品箱を取る');
      pick(function () { return s.c; }, function () { return s.c.position.clone(); });
      drive(KX, '台車にそろえる');
      place(function () { return kc.localToWorld(kitSlots[k].clone()); }, function (o) {
        filled.push({ o: o, s: s }); done++; ui.count('夜間・そろえた箱 ' + done);
        var n = crate(o.userData.body.material.color.getStyle()); scene.add(n); n.position.copy(s.home); n.visible = false; s.c = n;
      });
      if (k === kitSlots.length - 1) {
        act({ dur: 2.4, start: function () { ui.cap('台車がいっぱい → 次の台車へ'); this.items = filled; filled = []; },
              update: function (p) { var dx = ease(p) * 3; kc.position.x = KX + dx; this.items.forEach(function (f, i) { f.o.position.copy(kc.localToWorld(kitSlots[i].clone())); }); } });
        call(function () {
          scene.remove(kc); kc = kitCart(); kc.position.set(KX, 0, -0.95);
          slots.forEach(function (sl) { sl.c.visible = true; });
          scene.children.filter(function (o) { return o.userData && o.userData.size && o.position.x > KX + 2; }).forEach(function (o) { scene.remove(o); });
        });
      }
    };
    view = { target: V3(0.6, 0.6, -0.6), az: 0.25, el: 0.55, pts: [] };
    [-4.7, 5.4].forEach(function (x) { [-1.4, 0.9].forEach(function (z) { [0, 1.9].forEach(function (y) { view.pts.push(V3(x, y, z)); }); }); });
    ui.count('夜間・そろえた箱 0');
  }
  if (bot.z == null) bot.z = 0;
  bot.lastX = bot.x;

  /* ---------------- カメラ（ドラッグで回せる） ---------------- */
  var dist = 10;
  function placeCam() {
    var d = V3(Math.sin(view.az) * Math.cos(view.el), Math.sin(view.el), Math.cos(view.az) * Math.cos(view.el));
    camera.position.copy(view.target).addScaledVector(d, dist); camera.lookAt(view.target);
  }
  function fit() {                        // 景色の要所がすべて入る、いちばん近い距離
    for (dist = 3; dist < 80; dist *= 1.03) {
      placeCam(); camera.updateMatrixWorld(true);
      if (view.pts.every(function (p) { var q = p.clone().project(camera); return q.z < 1 && Math.abs(q.x) < 0.98 && Math.abs(q.y) < 0.92; })) break;
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

  var clock = 0;
  function render() { renderer.render(scene, camera); }
  resize();
  poseBot(); render();

  return {
    tick: function (dt) {
      dt = Math.min(dt, 0.1);
      clock += dt;
      stepBot(dt); sim.tick(dt); poseBot(); render();
    }
  };
};
