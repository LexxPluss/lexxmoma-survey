/* 使いどころの 3D シミュレーション：工場全体を俯瞰し、その中の5つの使いどころで LexxMoMa がそれぞれ作業する。
   ものの流れ：部品製造（研削・切削／板金・樹脂）→ 検査 → 物流（セットパック：1台分の部品を1つのポリ箱へ）→ 組立ライン（ライン横の部品供給）
   設備に部品を置く使いどころでは、通路を走って設備の前へ行き、部品は機体の後ろの台車から取り、前の設備へ置く。通路は使いどころごとに別。
   見た目は shooter-concept.html（方眼の床・通路の青・作業域の緑・Φ28パイプの棚）に合わせています。機体の形は moma-model.js（先に読み込む）。
   使い方：var s = FactoryScene(要素, { view: 表示が変わったときの関数(番号。-1 は全体) });
           s.tick(秒); s.focus(番号 | -1); s.names（使いどころの名前） */
window.FactoryScene = function (host, ui) {
  if (!window.THREE || !window.MomaModel) return null;
  var V3 = function (x, y, z) { return new THREE.Vector3(x || 0, y || 0, z || 0); };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var ease = function (t) { t = clamp(t, 0, 1); return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; };
  var M = MomaModel(), mat = M.mat, box = M.box, cyl = M.cyl, TOOL = M.TOOL;
  var C = { blue: '#0068B7', green: '#3EB370', frame: '#D9D3C0', full: '#2f6fb3', empty: '#cdd5db', aisle: '#5AA0DC' };

  var renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true }); } catch (e) { return null; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.appendChild(renderer.domElement);
  var scene = new THREE.Scene();
  scene.background = new THREE.Color('#eef2f5');
  var camera = new THREE.PerspectiveCamera(32, 1.6, 0.1, 300);
  scene.add(new THREE.HemisphereLight('#ffffff', '#c9d3db', 0.75));
  var sun = new THREE.DirectionalLight('#ffffff', 0.75);
  sun.position.set(6, 16, 10); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 1, far: 50 });
  scene.add(sun);
  function shade(o) { o.traverse(function (m) { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); return o; }
  var clock = 0;

  /* ---------------- 景色の部品 ---------------- */
  function plane(x0, x1, z0, z1, color, op, y) {
    var p = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: op, depthWrite: false }));
    p.rotation.x = -Math.PI / 2; p.position.set((x0 + x1) / 2, y || 0.004, (z0 + z1) / 2); scene.add(p); return p;
  }
  function outline(x0, x1, z0, z1, color) {   // 床の区画線（四角）
    var pts = [V3(x0, 0.006, z0), V3(x1, 0.006, z0), V3(x1, 0.006, z1), V3(x0, 0.006, z1), V3(x0, 0.006, z0)];
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: color })));
  }
  function aisle(x0, x1, z0, z1) { plane(x0, x1, z0, z1, C.aisle, 0.16); outline(x0, x1, z0, z1, '#f2c230'); }   // LexxMoMa の通路
  function floorText(text, x, z, w, color) {    // 床に書いた区域の名前（上から読める向き）
    var c = document.createElement('canvas'); c.width = 512; c.height = 128;
    var g = c.getContext('2d'); g.fillStyle = color || '#5f6b76'; g.font = '800 72px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 256, 68);
    var m = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.008, z); scene.add(m);
  }
  function arrow(x0, z0, x1, z1) {              // 床のものの流れ（太い矢印）
    var d = V3(x1 - x0, 0, z1 - z0), L = d.length(), a = Math.atan2(-d.z, d.x);
    var g = new THREE.Group(); g.position.set(x0, 0.007, z0); g.rotation.y = a; scene.add(g);
    var m = new THREE.MeshBasicMaterial({ color: '#f0a43a', transparent: true, opacity: 0.55, depthWrite: false });
    var body = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(0.1, L - 0.5), 0.28), m); body.rotation.x = -Math.PI / 2; body.position.x = (L - 0.5) / 2; g.add(body);
    var sh = new THREE.Shape(); sh.moveTo(0, -0.38); sh.lineTo(0.55, 0); sh.lineTo(0, 0.38); sh.lineTo(0, -0.38);
    var head = new THREE.Mesh(new THREE.ShapeGeometry(sh), m); head.rotation.x = -Math.PI / 2; head.position.x = L - 0.55; g.add(head);
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
    g.userData = { size: s, body: b, setColor: function (c) { b.material = mat(c); top.material = mat(c === C.empty ? '#aab6c0' : '#1d3f63'); } };
    return shade(g);
  }
  var RAW = '#5b6670', DONE = '#a9bfd0';
  function part(color) {                 // 加工部品（小さなブロック）
    var g = new THREE.Group();
    box(g, 0.24, 0.1, 0.2, color, 0, 0, 0, color === DONE ? { metalness: 0.5, roughness: 0.35 } : null);
    cyl(g, 0.04, 0.11, '#3a4148', 0.05, 0.005, 0, 'y');
    g.userData = { size: { x: 0.24, y: 0.1, z: 0.2 } };
    return shade(g);
  }
  function finish(p) { p.children[0].material = mat(DONE, { metalness: 0.5, roughness: 0.35 }); }
  function worker(x, z, rotY) {          // 作業者（緑のベスト・白いヘルメット）
    var g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rotY || 0; scene.add(g);
    var vest = mat(C.green), pants = mat('#44525c'), skin = mat('#efd9c6');
    [-1, 1].forEach(function (s) { box(g, 0.13, 0.84, 0.15, pants, s * 0.085, 0.42, 0); });
    box(g, 0.4, 0.58, 0.23, vest, 0, 1.13, 0);
    box(g, 0.41, 0.06, 0.24, '#f2f5f7', 0, 1.0, 0);
    var hd = new THREE.Mesh(new THREE.SphereGeometry(0.105, 16, 12), skin); hd.position.y = 1.54; g.add(hd);
    var hm = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat('#ffffff')); hm.position.y = 1.56; g.add(hm);
    var arms = [-1, 1].map(function (s) { var a = new THREE.Group(); a.position.set(s * 0.25, 1.36, 0); g.add(a); box(a, 0.09, 0.58, 0.1, vest, 0, -0.29, 0); return a; });
    shade(g);
    return { reach: function (r) { arms.forEach(function (a) { a.rotation.x = -r * 1.25; }); } };
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
  function pipeRack(g, w, d, h) {        // Φ28 パイプの骨組み
    var t = 0.028, m = mat(C.frame);
    [-1, 1].forEach(function (sx) { [-1, 1].forEach(function (sz) { box(g, t, h, t, m, sx * w / 2, h / 2, sz * d / 2); }); });
    [0.06, h].forEach(function (y) { [-1, 1].forEach(function (s) { box(g, w, t, t, m, 0, y, s * d / 2); box(g, t, t, d, m, s * w / 2, y, 0); }); });
  }
  function cart(x, z, ry) {              // 2段の台車（上段の高さ 0.78）
    var g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry || 0; scene.add(g);
    box(g, 0.9, 0.03, 0.6, '#8b98a4', 0, 0.78, 0); box(g, 0.9, 0.03, 0.6, '#8b98a4', 0, 0.3, 0);
    [-1, 1].forEach(function (sx) { [-1, 1].forEach(function (sz) { box(g, 0.03, 0.8, 0.03, '#8b98a4', sx * 0.43, 0.4, sz * 0.28); cyl(g, 0.04, 0.03, '#2b3135', sx * 0.38, 0.04, sz * 0.24, 'z'); }); });
    return shade(g);
  }
  function stackLamp(parent, x, y, z) {  // 表示灯（赤・黄・緑）
    var m = [['#e0302a', 0.24], ['#f2c230', 0.12], ['#3EB370', 0]].map(function (l) {
      var mm = new THREE.MeshStandardMaterial({ color: l[0], emissive: l[0], emissiveIntensity: 0.05 });
      var c = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.11, 16), mm); c.position.set(x, y + l[1], z); parent.add(c); return mm;
    });
    cyl(parent, 0.015, 0.12, '#8b98a4', x, y - 0.12, z, 'y');
    return { set: function (run, t) { m[2].emissiveIntensity = run ? 1 : 0.05; m[1].emissiveIntensity = run ? 0.05 : (Math.floor(t * 2) % 2 ? 1 : 0.3); } };
  }

  /* ---------------- LexxMoMa 1台ごとの台本（使いどころごとに1台） ---------------- */
  function Bot(x, z, heading) {
    var R = M.BODIES.lexx(); shade(R.g); scene.add(R.g);
    var HOME = V3(0.1, 1.4, 0), CARRY = V3(0.05, 1.32, 0);   // 台車に対する手首の位置（走るとき・持って回すとき）
    var b = { R: R, x: x, z: z, h: heading || 0, wristL: HOME.clone(), open: 1, held: null, lastX: x, lastZ: z, lastH: heading || 0, queue: [], cur: null, script: null };
    function act(o) { b.queue.push(Object.assign({ dur: 0 }, o)); }
    b.go = function (tx, tz) {              // (tx, tz) までまっすぐ走る。R1 の仕様どおり、最高速度 2.0m/s・加速度 1.5m/s² の台形で
      act({ start: function () {
          var V = 2.0, A = 1.5;
          this.x0 = b.x; this.z0 = b.z; this.tz = tz == null ? b.z : tz;
          this.d = Math.hypot(tx - b.x, this.tz - b.z);
          this.vp = this.d >= V * V / A ? V : Math.sqrt(this.d * A); this.ta = this.vp / A;
          this.dur = this.d >= V * V / A ? this.d / V + V / A : 2 * this.ta;
        },
        update: function (p) {
          var t = p * this.dur, s, ta = this.ta, vp = this.vp, T = this.dur, a = ta ? vp / ta : 0;
          if (t < ta) s = 0.5 * a * t * t;
          else if (t < T - ta) s = 0.5 * vp * ta + vp * (t - ta);
          else { var r = T - t; s = this.d - 0.5 * a * r * r; }
          var k = this.d ? Math.min(1, s / this.d) : 1;
          b.x = this.x0 + (tx - this.x0) * k; b.z = this.z0 + (this.tz - this.z0) * k;
        } });
    };
    b.drive = function (tx) { b.go(tx, null); };   // 車体の前後（x 方向）に走る
    b.turn = function (h) {                 // その場で向きを変える（2輪駆動）
      act({ start: function () { this.h0 = b.h; this.dur = Math.abs(h - b.h) / 1.6 + 0.3; }, update: function (p) { b.h = this.h0 + (h - this.h0) * ease(p); } });
    };
    function wrap(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a <= -Math.PI) a += 2 * Math.PI; return a; }
    b.face = function (h) {                 // h の向きへ、近い回り方で向き直る
      act({ start: function () { this.h0 = b.h; this.h1 = b.h + wrap(h - b.h); this.dur = Math.abs(this.h1 - this.h0) / 1.6 + (Math.abs(this.h1 - this.h0) > 0.01 ? 0.3 : 0); },
            update: function (p) { b.h = this.h0 + (this.h1 - this.h0) * ease(p); } });
    };
    // (tx, tz) へ L字に走る：今の向きの軸に沿って角まで走り、その場で向きを変えて、もう一方の軸へ。
    // 逆向きに走るほうが近いときは、向きを変えずに後ろへ走る（2輪駆動）。最後に th の向きへ
    b.route = function (tx, tz, th) {
      b.call(function () {
        var q = b.queue; b.queue = [];
        var ch = b.h, px = b.x, pz = b.z, alongX = Math.abs(Math.cos(ch)) > 0.5;
        (alongX ? [[tx, pz], [tx, tz]] : [[px, tz], [tx, tz]]).forEach(function (p) {
          var dx = p[0] - px, dz = p[1] - pz;
          if (Math.abs(dx) + Math.abs(dz) < 1e-3) return;
          var h = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 0 : Math.PI) : (dz < 0 ? Math.PI / 2 : -Math.PI / 2);
          if (Math.abs(wrap(h - ch)) > Math.PI / 2 + 0.01) h = wrap(h + Math.PI);   // 後ろへ走る
          if (Math.abs(wrap(h - ch)) > 0.01) { b.face(h); ch = h; }
          b.go(p[0], p[1]); px = p[0]; pz = p[1];
        });
        if (th != null && Math.abs(wrap(th - ch)) > 0.01) b.face(th);
        b.queue = b.queue.concat(q);
      });
    };
    b.armTo = function (fn, dur) {          // fn：手首の目標（ワールド座標）を返す関数、または台車に対する決まった姿勢
      act({ dur: dur || 0.9, start: function () { this.a = b.wristL.clone(); this.b = fn.isVector3 ? fn.clone() : R.g.worldToLocal(fn()); },
            update: function (p) { b.wristL.copy(this.a).lerp(this.b, ease(p)); } });
    };
    b.grip = function (open) { act({ dur: 0.35, start: function () { this.a = b.open; }, update: function (p) { b.open = this.a + (open - this.a) * p; } }); };
    b.call = function (fn) { act({ start: fn }); };
    b.act = act;
    b.until = function (cond) { act({ dur: 1e9, until: cond }); };
    function wristFor(c, half) {            // 中心 c の物を持つときの手首：肩から c へ向かう向きで、手先の分だけ手前
      var s = R.arm.shoulderW(), d = V3(c.x - s.x, 0, c.z - s.z).normalize();
      return c.clone().addScaledVector(d, -(TOOL + half));
    }
    function above(w, c) { var s = R.arm.shoulderW(), d = V3(c.x - s.x, 0, c.z - s.z).normalize(); return w.clone().addScaledVector(d, -0.22).add(V3(0, 0.12, 0)); }
    b.pick = function (obj, getCenter, after) {
      var c, half = function () { return obj().userData.size.x / 2; };
      b.armTo(function () { c = getCenter(); return above(wristFor(c, half()), c); });
      b.armTo(function () { return wristFor(c, half()); }, 0.6);
      b.grip(0);
      b.call(function () { var o = obj(); if (o.parent !== scene) scene.attach(o); b.held = o; if (after) after(); });
      b.armTo(function () { return above(wristFor(c, b.held.userData.size.x / 2), c); }, 0.6);
      b.armTo(CARRY, 0.8);
    };
    b.place = function (getCenter, onDrop) {
      var half, c;
      b.armTo(function () { half = b.held.userData.size.x / 2; c = getCenter(); return above(wristFor(c, half), c); });
      b.armTo(function () { return wristFor(c, half); }, 0.6);
      b.call(function () { var o = b.held; b.held = null; o.position.copy(c); o.rotation.set(0, 0, 0); if (onDrop) onDrop(o); });
      b.grip(1);
      b.armTo(function () { return above(wristFor(c, half), c); }, 0.6);
      b.armTo(CARRY, 0.7);
    };
    b.step = function (dt) {
      while (dt > 0) {
        if (!b.cur) { if (!b.queue.length) b.script(); b.cur = b.queue.shift(); b.cur.t = 0; if (b.cur.start) b.cur.start(); }
        if (b.cur.until) { if (b.cur.until()) { b.cur = null; continue; } return; }
        var use = Math.min(dt, b.cur.dur - b.cur.t);
        b.cur.t += use; dt -= use;
        if (b.cur.update) b.cur.update(b.cur.dur ? b.cur.t / b.cur.dur : 1);
        if (b.cur.t >= b.cur.dur - 1e-9) b.cur = null;
      }
    };
    b.pose = function () {
      // 車体の前後は x 方向（向き h で回す）。前後に走った距離ぶん駆動輪を回す
      R.g.position.set(b.x, 0, b.z); R.g.rotation.y = b.h;
      var f = (b.x - b.lastX) * Math.cos(b.h) - (b.z - b.lastZ) * Math.sin(b.h), dh = b.h - b.lastH;   // 前進分と旋回分で左右の車輪を回す
      R.spin.forEach(function (w, i) { w.rotation.y -= (f - (i ? 1 : -1) * dh * 0.3) / 0.085; });
      b.lastX = b.x; b.lastZ = b.z; b.lastH = b.h;
      R.g.updateMatrixWorld(true);
      R.arm.ik(R.g.localToWorld(b.wristL.clone()), true);
      R.arm.setFingers(clamp(b.open, 0, 1));
      if (b.held) {
        var yaw = R.arm.toolYaw(), half = b.held.userData.size.x / 2;
        b.held.position.copy(R.arm.tipW()).add(V3(Math.cos(yaw) * half, 0, -Math.sin(yaw) * half));
        b.held.rotation.set(0, yaw, 0);
      }
    };
    return b;
  }
  var FACE_N = Math.PI / 2, FACE_S = -Math.PI / 2;   // 車体の前を -z（北）／ +z（南）へ向ける

  /* ---------------- 工場の床 ---------------- */
  var F = { x0: -15, x1: 15.5, z0: -10, z1: 7.5 };
  var fl = new THREE.Mesh(new THREE.PlaneGeometry(F.x1 - F.x0, F.z1 - F.z0), mat('#f7f9fa'));
  fl.rotation.x = -Math.PI / 2; fl.position.set((F.x0 + F.x1) / 2, 0, (F.z0 + F.z1) / 2); fl.receiveShadow = true; scene.add(fl);
  var grid = new THREE.GridHelper(32, 64, '#dbe2e8', '#e8edf1'); grid.position.set((F.x0 + F.x1) / 2, 0.002, (F.z0 + F.z1) / 2); scene.add(grid);
  // 区域：部品製造・検査・物流・組立ライン
  plane(-14.5, -4.2, -5.6, 6.8, '#7b8794', 0.05); outline(-14.5, -4.2, -5.6, 6.8, '#b7c3cd'); floorText('部品製造', -11.9, 6.0, 4.4);
  plane(-3.4, 3.4, -1.2, 5.4, '#7b8794', 0.05); outline(-3.4, 3.4, -1.2, 5.4, '#b7c3cd'); floorText('検査', -2.3, 4.9, 2.2);
  plane(4.4, 15, -0.6, 6.8, '#7b8794', 0.05); outline(4.4, 15, -0.6, 6.8, '#b7c3cd'); floorText('物流', 6.1, 6.0, 2.8);
  floorText('組立ライン', 0.6, -8.0, 4.0);
  arrow(-4.0, 1.0, -3.5, 1.0); arrow(3.5, 1.4, 4.4, 1.4); arrow(7.6, -0.4, 7.6, -2.6);   // 製造 → 検査 → 物流 → ライン
  [[-14.5, -7, 'B21'], [-4.2, 6.8, 'B24'], [3.8, -2.6, 'C12'], [15.2, 6.8, 'C15']].forEach(function (p) { pillar(p[0], p[1], p[2]); });

  var cells = [];

  // 台車の上の置き場所（台車の向きに合わせてワールド座標にする）
  function cartAt(c, lx, lz) { c.updateMatrixWorld(true); return c.localToWorld(V3(lx, 0.85, lz)); }

  /* ① 研削・切削設備への部品の設置：加工機2台を L字の通路の角の両側に。終わった加工機の前へ走り（角で向きを変える）、
     向かいの台車から材料を取って入れ、加工済みは台車へ戻す */
  (function () {
    var X = -9.4, Z = -2.2, TABLE = 0.86;
    aisle(X - 2.2, X + 1.5, Z - 0.55, Z + 0.55); aisle(X + 0.4, X + 1.5, Z - 1.85, Z - 0.55);   // L字の通路
    function cnc(cx, cz, ry) {                // 加工機（扉は機械の +z の面）
      var g = new THREE.Group(); g.position.set(cx, 0, cz); g.rotation.y = ry; scene.add(g);
      var body = mat('#e3e8ec'), trim = mat('#0b4f8f');
      box(g, 1.7, 0.75, 1.3, body, 0, 0.375, 0); box(g, 1.7, 0.55, 1.3, body, 0, 1.775, 0);
      box(g, 0.45, 0.7, 1.3, body, -0.625, 1.15, 0); box(g, 0.45, 0.7, 1.3, body, 0.625, 1.15, 0);
      box(g, 1.72, 0.08, 1.32, trim, 0, 2.0, 0);
      box(g, 0.8, 0.02, 0.6, '#9aa5ae', 0, TABLE - 0.01, 0.2);
      box(g, 0.28, 0.4, 0.06, '#2b3135', 0.62, 1.25, 0.66);
      var door = box(g, 0.82, 0.7, 0.03, new THREE.MeshStandardMaterial({ color: '#9fc3e0', transparent: true, opacity: 0.55 }), 0, 1.15, 0.64);
      var m = { door: door, lamp: stackLamp(g, 0.7, 2.18, 0.45), open: 0, doneAt: 0, part: part(DONE), raw: [], out: [] };
      shade(g); g.updateMatrixWorld(true);
      m.IN = g.localToWorld(V3(0, TABLE + 0.05, 0.35));
      scene.add(m.part); m.part.position.copy(m.IN);
      return m;
    }
    var ms = [cnc(X - 1.4, -3.65, 0), cnc(X + 2.3, Z - 1.2, -Math.PI / 2)];
    ms[0].stop = [X - 1.4, Z, 0]; ms[0].cart = cart(X - 1.4, Z + 1.3);                         // 角の手前：加工機は北、台車は南
    ms[1].stop = [X + 0.95, Z - 1.2, Math.PI / 2]; ms[1].cart = cart(X - 0.1, Z - 1.2, Math.PI / 2);   // 角の先：加工機は東、台車は西
    ms[1].doneAt = 7;
    ms.forEach(function (m) {
      m.refill = function () { while (m.raw.length < 2) { var q = part(RAW); scene.add(q); m.raw.push(q); } m.raw.forEach(function (o, k) { o.position.copy(cartAt(m.cart, -0.3 + k * 0.26, 0)); }); };
      m.refill();
    });
    var bot = Bot(ms[0].stop[0], Z, 0), turn = 0;
    bot.script = function () {
      var m = ms[turn++ % ms.length];
      bot.route(m.stop[0], m.stop[1], m.stop[2]);
      bot.until(function () { return clock >= m.doneAt; });
      bot.act({ dur: 0.7, update: function (p) { m.open = p; } });
      bot.pick(function () { return m.part; }, function () { return m.IN.clone(); });
      bot.place(function () { return cartAt(m.cart, 0.3, (m.out.length % 2) * 0.2 - 0.1); }, function (o) { m.out.push(o); if (m.out.length > 2) scene.remove(m.out.shift()); });
      bot.pick(function () { return m.raw[0]; }, function () { return m.raw[0].position.clone(); }, function () { m.raw.shift(); m.refill(); });
      bot.place(function () { return m.IN.clone(); }, function (o) { m.part = o; });
      bot.act({ dur: 0.7, update: function (p) { m.open = 1 - p; } });
      bot.call(function () { m.doneAt = clock + 14; m.part.userData.finishAt = m.doneAt; });
    };
    cells.push({ name: '研削・切削設備への部品の設置', short: '研削・切削', view: { az: 0.45, el: 0.8, w: 2.9, d: 2.1 }, at: V3(X + 0.2, 0.8, Z - 0.8), bot: bot,
      tick: function () {
        ms.forEach(function (m) {
          m.door.position.y = 1.15 + m.open * 0.62;
          var run = clock < m.doneAt; m.lamp.set(run, clock);
          if (!run && m.part.userData.finishAt) { finish(m.part); m.part.userData.finishAt = 0; }
        });
      } });
  })();

  /* ② 板金・樹脂部品の設置：溶接の区画2つを L字の通路の角の両側に。溶接が終わった治具の前へ走り、向かいの台車から部品を取って置く */
  (function () {
    var X = -9.4, Z = 2.4;
    aisle(X - 2.2, X + 1.4, Z - 0.55, Z + 0.55); aisle(X + 0.3, X + 1.4, Z + 0.55, Z + 2.45);   // L字の通路
    var fence = new THREE.MeshStandardMaterial({ color: '#c9d0d6', transparent: true, opacity: 0.35, side: THREE.DoubleSide }), post = mat('#f2c230');
    var curtain = new THREE.MeshStandardMaterial({ color: '#f2c230', emissive: '#f2c230', emissiveIntensity: 0.5 });
    function cage(x0, x1, z0, z1, open) {    // 柵（open の辺は入口：光の柵）
      [[x0, z0], [x1, z0], [x0, z1], [x1, z1]].forEach(function (p) { box(scene, 0.06, 1.8, 0.06, post, p[0], 0.9, p[1]); });
      [['n', (x0 + x1) / 2, z0, x1 - x0, 'x'], ['s', (x0 + x1) / 2, z1, x1 - x0, 'x'], ['w', x0, (z0 + z1) / 2, z1 - z0, 'z'], ['e', x1, (z0 + z1) / 2, z1 - z0, 'z']].forEach(function (p) {
        var isX = p[4] === 'x';
        if (p[0] === open) {
          [-1, 1].forEach(function (s) { var px = isX ? p[1] + s * 0.8 : p[1], pz = isX ? p[2] : p[2] + s * 0.8;
            box(scene, 0.07, 1.4, 0.07, '#2b3135', px, 0.7, pz); box(scene, isX ? 0.03 : 0.02, 1.2, isX ? 0.02 : 0.03, curtain, px, 0.75, pz); });
          return;
        }
        box(scene, isX ? p[3] : 0.02, 1.5, isX ? 0.02 : p[3], fence, p[1], 0.95, p[2]);
        box(scene, isX ? p[3] : 0.04, 0.04, isX ? 0.04 : p[3], post, p[1], 1.72, p[2]);
      });
    }
    function plate(resin) {          // 板金（金属の板）と樹脂（黒い成形品）
      var p = new THREE.Group(); box(p, 0.42, 0.04, 0.3, resin ? '#2f3438' : '#b9c2c9', 0, 0, 0, resin ? { roughness: 0.5 } : { metalness: 0.6, roughness: 0.35 });
      p.userData = { size: { x: 0.42, y: 0.04, z: 0.3 }, resin: resin }; return shade(p);
    }
    function station(jx, jz, wx, wz) {      // 溶接治具と溶接ロボット
      var tbl = new THREE.Group(); tbl.position.set(jx, 0, jz); scene.add(tbl);
      box(tbl, 0.9, 0.8, 0.6, '#5b6670', 0, 0.4, 0);
      [-0.25, 0.25].forEach(function (dx) { [-0.18, 0.18].forEach(function (dz) { box(tbl, 0.05, 0.08, 0.05, '#e5832d', dx, 0.84, dz); }); });
      shade(tbl);
      shade(box(scene, 0.45, 0.5, 0.45, '#5b6670', wx, 0.25, wz));
      var wr = new THREE.Group(); scene.add(wr);
      var arm = M.makeArm(wr, { body: '#f08a24', ring: '#3a4148', tool: '#3a4148', L1: 0.75, L2: 0.75 }, V3(wx, 0.5, wz)); shade(wr);
      var spark = new THREE.PointLight('#bfe2ff', 0, 3); scene.add(spark);
      var sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(60), 3));
      var sparks = new THREE.Points(sg, new THREE.PointsMaterial({ color: '#ffd27a', size: 0.04 })); sparks.visible = false; scene.add(sparks);
      var toW = V3(wx - jx, 0, wz - jz).normalize();   // 治具から溶接ロボットへの向き
      var w = { J: V3(jx, 0.88, jz), arm: arm, home: V3(jx, 1.55, jz).addScaledVector(toW, 1.15), toW: toW, spark: spark, sg: sg, sparks: sparks, t: -1, onJig: null, stock: [], out: [], n: 0 };
      arm.ik(w.home, true);
      return w;
    }
    cage(X - 3.0, X - 0.6, 3.35, 6.2, 'n');
    cage(X + 1.6, X + 3.9, 3.25, 5.5, 'w');
    var ws = [station(X - 1.6, 3.75, X - 1.6, 5.2), station(X + 2.2, Z + 1.9, X + 3.3, Z + 1.9)];
    ws[0].stop = [X - 1.6, Z, 0]; ws[0].cart = cart(X - 1.6, Z - 1.3);                          // 角の手前：治具は南、台車は北
    ws[1].stop = [X + 0.85, Z + 1.9, -Math.PI / 2]; ws[1].cart = cart(X - 0.05, Z + 1.9, Math.PI / 2); ws[1].n = 1;   // 角の先：治具は東、台車は西
    ws.forEach(function (w) {
      w.refill = function () { while (w.stock.length < 2) { var q = plate(w.n++ % 2 === 1); scene.add(q); w.stock.unshift(q); } w.stock.forEach(function (o, k) { o.position.copy(cartAt(w.cart, -0.22, 0)).add(V3(0, -0.03 + k * 0.05, 0)); }); };
      w.refill();
    });
    var bot = Bot(ws[0].stop[0], Z, 0), turn = 0;
    bot.script = function () {
      var w = ws[turn++ % ws.length];
      bot.route(w.stop[0], w.stop[1], w.stop[2]);
      bot.until(function () { return w.t < 0; });
      bot.call(function () {                // 溶接済みがあれば先に取り出す（その場で台本に差し込む）
        var q = bot.queue; bot.queue = [];
        if (w.onJig) {
          bot.pick(function () { return w.onJig; }, function () { return w.J.clone(); }, function () { w.onJig = null; });
          bot.place(function () { return cartAt(w.cart, 0.24, w.out.length % 2 ? 0.12 : -0.12).add(V3(0, -0.03, 0)); }, function (o) { w.out.push(o); if (w.out.length > 2) scene.remove(w.out.shift()); });
        }
        bot.pick(function () { return w.stock[w.stock.length - 1]; }, function () { return w.stock[w.stock.length - 1].position.clone(); }, function () { w.stock.pop(); w.refill(); });
        bot.place(function () { return w.J.clone(); }, function (o) { w.onJig = o; });
        bot.call(function () { w.t = 0; });
        bot.queue = bot.queue.concat(q);
      });
    };
    cells.push({ name: '板金・樹脂部品の設置', short: '板金・樹脂', view: { az: 0.5, el: 0.85, w: 3.0, d: 2.3 }, at: V3(X + 0.3, 0.8, Z + 1.2), bot: bot,
      tick: function (dt) {
        ws.forEach(function (w) {
          if (w.t < 0) { w.arm.ik(w.home, true); w.spark.intensity = 0; w.sparks.visible = false; return; }
          w.t += dt;
          var T = w.t, on = T > 1.2 && T < 4.2, s = T < 1.2 ? T / 1.2 : T < 4.2 ? 1 : 1 - (T - 4.2) / 1.2;
          var side = V3(-w.toW.z, 0, w.toW.x), seam = w.J.clone().add(V3(0, 0.04, 0)).addScaledVector(side, -0.16 + 0.32 * clamp((T - 1.2) / 3, 0, 1));
          w.arm.ik(w.home.clone().lerp(seam.clone().add(V3(0, 0.05, 0)).addScaledVector(w.toW, 0.2), ease(s)), true);
          var metal = w.onJig && !w.onJig.userData.resin;
          w.spark.intensity = on && metal ? 0.8 + Math.random() * 1.4 : 0; w.spark.position.copy(seam).add(V3(0, 0.1, 0));
          w.sparks.visible = on && metal;
          if (on) {
            var a = w.sg.attributes.position.array;
            for (var k = 0; k < 20; k++) { a[k * 3] = seam.x + (Math.random() - 0.5) * 0.25; a[k * 3 + 1] = seam.y + Math.random() * 0.2; a[k * 3 + 2] = seam.z + (Math.random() - 0.5) * 0.25; }
            w.sg.attributes.position.needsUpdate = true;
            if (w.onJig && !w.onJig.userData.seam) w.onJig.userData.seam = box(w.onJig, 0.32, 0.012, 0.02, w.onJig.userData.resin ? '#6c7378' : '#4a3a2a', 0, 0.026, 0);   // 溶接・接合の跡
          }
          if (T > 5.4) w.t = -1;
        });
      } });
  })();

  /* ③ 検査機への部品投入と検査記録：検査機3台を T字の通路のまわりに、台車1台を T の交わるところに。
     台車から取り、空いた検査機へ走って（角で向きを変える）入れる。終わった部品は台車へ戻す */
  (function () {
    var X = 0, Z = 1.6;
    aisle(X - 2.3, X + 2.3, Z - 0.55, Z + 0.55); aisle(X - 0.55, X + 0.55, Z + 0.55, Z + 1.95);   // T字の通路
    function inspector(cx, cz, ry) {          // 検査機（トレイは機械の +z の面から出入りする）
      var g = new THREE.Group(); g.position.set(cx, 0, cz); g.rotation.y = ry; scene.add(g);
      var body = mat('#eef1f3'), trim = mat('#0b4f8f');
      box(g, 1.3, 0.8, 1.0, body, 0, 0.4, 0); box(g, 1.3, 0.55, 1.0, body, 0, 1.825, 0);
      [-0.6, 0.6].forEach(function (dx) { box(g, 0.1, 0.75, 1.0, body, dx, 1.175, 0); });
      box(g, 1.32, 0.06, 1.02, trim, 0, 2.12, 0);
      box(g, 0.2, 0.1, 0.2, '#1d2226', 0, 1.5, 0);
      var ringM = new THREE.MeshStandardMaterial({ color: '#5AA0DC', emissive: '#5AA0DC', emissiveIntensity: 0.2 });
      var ring = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.015, 8, 24), ringM); ring.rotation.x = Math.PI / 2; ring.position.set(0, 1.44, 0); g.add(ring);
      var tray = box(g, 0.5, 0.02, 0.4, '#9aa5ae', 0, 0.82, 0.6);
      var cv = document.createElement('canvas'); cv.width = 256; cv.height = 128;
      var tex = new THREE.CanvasTexture(cv);
      var screen = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.31), new THREE.MeshBasicMaterial({ map: tex })); screen.position.set(0, 1.83, 0.51); g.add(screen);
      shade(g); g.updateMatrixWorld(true);
      var m = { g: g, tray: tray, ringM: ringM, t: -1, drawn: 0, onTray: null, records: 0, OUT: g.localToWorld(V3(0, 0.88, 0.6)) };
      m.trayAt = function (lz) { g.updateMatrixWorld(true); return g.localToWorld(V3(0, 0.88, lz)); };
      m.draw = function (state) {
        var x2 = cv.getContext('2d');
        x2.fillStyle = '#10202e'; x2.fillRect(0, 0, 256, 128); x2.textAlign = 'center'; x2.textBaseline = 'middle';
        x2.fillStyle = state === 'ok' ? '#3EB370' : state === 'scan' ? '#5AA0DC' : '#8b98a4';
        x2.font = '700 46px sans-serif'; x2.fillText(state === 'ok' ? 'OK' : state === 'scan' ? '検査中' : '待機', 128, 50);
        x2.fillStyle = '#d5dee6'; x2.font = '700 24px sans-serif'; x2.fillText('記録 ' + m.records + ' 件', 128, 100);
        tex.needsUpdate = true;
      };
      m.draw('idle');
      return m;
    }
    var ms = [inspector(X - 1.6, -0.25, 0), inspector(X + 1.6, -0.25, 0), inspector(X, Z + 2.95, Math.PI)];
    ms[0].stop = [X - 1.6, Z, 0]; ms[1].stop = [X + 1.6, Z, 0]; ms[2].stop = [X, Z + 1.4, -Math.PI / 2];   // 3台目は T の足の先（南向き）
    var C0 = [X, Z, 0], crt = cart(X, Z - 1.0);                                                         // 台車は T の交わるところ（北側）
    var stock = [], out = [];
    function refill() { while (stock.length < 2) { var q = part(DONE); scene.add(q); stock.push(q); } stock.forEach(function (o, k) { o.position.copy(cartAt(crt, -0.3 + k * 0.26, 0)); }); }
    refill();
    var bot = Bot(X, Z, 0), turn = 0;
    bot.script = function () {
      var m = ms[turn++ % ms.length];
      bot.call(function () {                // 検査済みが載っていれば、先に取り出して台車へ戻す（その場で台本に差し込む）
        var q = bot.queue; bot.queue = [];
        if (m.onTray) {
          bot.route(m.stop[0], m.stop[1], m.stop[2]);
          bot.until(function () { return m.t < 0; });
          bot.pick(function () { return m.onTray; }, function () { return m.OUT.clone(); }, function () { m.onTray = null; });
        }
        bot.route(C0[0], C0[1], C0[2]);
        if (m.onTray) bot.place(function () { return cartAt(crt, 0.3, (out.length % 2) * 0.2 - 0.1); }, function (o) { out.push(o); if (out.length > 2) scene.remove(out.shift()); });
        bot.pick(function () { return stock[0]; }, function () { return stock[0].position.clone(); }, function () { stock.shift(); refill(); });
        bot.route(m.stop[0], m.stop[1], m.stop[2]);
        bot.place(function () { return m.OUT.clone(); }, function (o) { m.onTray = o; });
        bot.call(function () { m.t = 0; });
        bot.queue = bot.queue.concat(q);
      });
    };
    cells.push({ name: '検査機への部品投入と検査記録', short: '検査', view: { az: 0.35, el: 0.85, w: 2.8, d: 2.6 }, at: V3(X, 0.8, Z + 0.2), bot: bot,
      tick: function (dt) {
        ms.forEach(function (m) {
          m.ringM.emissiveIntensity = 0.2;
          if (m.t < 0) return;
          var T = (m.t += dt), lz;
          if (T < 0.9) lz = 0.6 - 0.6 * ease(T / 0.9);
          else if (T < 3.0) { lz = 0; m.ringM.emissiveIntensity = 0.6 + 0.6 * Math.sin(T * 12); if (!m.drawn) { m.draw('scan'); m.drawn = 1; } }
          else if (T < 3.9) { if (m.drawn === 1) { m.records++; m.draw('ok'); m.drawn = 2; } lz = 0.6 * ease((T - 3.0) / 0.9); }
          else { lz = 0.6; m.t = -1; m.drawn = 0; }
          m.tray.position.z = lz; if (m.onTray) m.onTray.position.copy(m.trayAt(lz));
        });
      } });
  })();

  /* ④ 完成部品のセットパック（物流）：1台分の部品を、部品棚から1つのポリ箱にそろえる。
     部品棚は通路をはさんで向かい合わせ（通路幅1.9m・棚の奥行き0.9m・1間口0.73m。実際は片側18間口ほど、ここでは11間口に縮めた）。
     LexxMoMa は空のポリ箱を天面に載せてスタートし、片側を進みながら表示灯の点いた間口で部品を取り、奥で折り返して反対側を戻る（U字に一周）。 */
  (function () {
    var X0 = 5.55, N = 11, P = 0.73, XE = X0 + N * P, ZN = 1.6, ZS = 4.4, LN = 2.55, LS = 3.45;   // 棚（北・南）の中心、通路の行き・帰りの走行線
    var LV = [0.5, 0.85, 1.2, 1.55];                                     // 段の手前の高さ（手前へ下がる流動棚）
    aisle(X0 - 0.9, XE + 0.6, 2.05, 3.95);
    [['Start', LN], ['End', LS]].forEach(function (m) {                  // 床の目印（図の Start・End）
      var c = document.createElement('canvas'); c.width = 128; c.height = 128;
      var g2 = c.getContext('2d'); g2.fillStyle = '#c9dcef'; g2.fillRect(0, 0, 128, 128); g2.strokeStyle = '#5AA0DC'; g2.lineWidth = 6; g2.strokeRect(3, 3, 122, 122);
      g2.fillStyle = '#1d4f8a'; g2.font = '700 34px sans-serif'; g2.textAlign = 'center'; g2.textBaseline = 'middle'; g2.fillText(m[0], 64, 66);
      var p = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.55), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c) }));
      p.rotation.x = -Math.PI / 2; p.position.set(X0 - 0.45, 0.009, m[1]); scene.add(p);
    });
    // 部品棚（写真のような流動棚：白い枠・手前へ傾いた段・青い箱・赤い指示板・黒い表示灯のレール）
    var frameM = mat('#e9ecee', { metalness: 0.2 }), binM = mat('#2f7fd0'), shelfM = mat('#c9d0d6'), railM = mat('#23292f'), redM = mat('#e2575d', { roughness: 0.5 });
    var nBins = N * 2 * LV.length * 2, bins = new THREE.InstancedMesh(new THREE.BoxGeometry(0.31, 0.12, 0.42), binM, nBins), bi = 0;
    var shelves = new THREE.InstancedMesh(new THREE.BoxGeometry(P - 0.02, 0.02, 0.9), shelfM, N * 2 * LV.length), si = 0;
    var o3 = new THREE.Object3D(), lamps = {};
    [[ZN, 1], [ZS, -1]].forEach(function (row) {
      var zc = row[0], face = row[1];                                   // face：通路の向き（北の棚は +z、南の棚は -z）
      for (var i = 0; i <= N; i++) box(scene, 0.04, 1.85, 0.9, frameM, X0 + i * P, 0.925, zc);   // 間口の仕切り（側板）
      [0.05, 1.85].forEach(function (y) { box(scene, N * P, 0.04, 0.04, frameM, X0 + N * P / 2, y, zc + face * 0.45); box(scene, N * P, 0.04, 0.04, frameM, X0 + N * P / 2, y, zc - face * 0.45); });
      for (i = 0; i < N; i++) {
        var bx = X0 + (i + 0.5) * P;
        LV.forEach(function (y, li) {
          o3.position.set(bx, y + 0.13, zc); o3.rotation.set(face * 0.16, 0, 0); o3.updateMatrix(); shelves.setMatrixAt(si++, o3.matrix);
          [-0.17, 0.17].forEach(function (dx) {
            o3.position.set(bx + dx, y + 0.21, zc + face * 0.2); o3.rotation.set(face * 0.16, 0, 0); o3.updateMatrix(); bins.setMatrixAt(bi++, o3.matrix);
          });
          var l = new THREE.MeshStandardMaterial({ color: '#4a5560', emissive: '#3EB370', emissiveIntensity: 0 });   // 表示灯（取る間口だけ点く）
          var lm = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.05, 12), l); lm.rotation.x = Math.PI / 2; lm.position.set(bx + 0.26, y + 0.04, zc + face * 0.47); scene.add(lm);
          lamps[(face > 0 ? 'n' : 's') + i + '-' + li] = l;
        });
        var red = box(scene, P - 0.08, 0.32, 0.01, redM, bx, 1.66, zc + face * 0.5); red.rotation.x = -face * 0.45;   // 赤い指示板
      }
      LV.forEach(function (y) { var r = cyl(scene, 0.03, N * P, railM, X0 + N * P / 2, y + 0.04, zc + face * 0.47, 'x'); r.castShadow = true; });   // 表示灯のレール
    });
    bins.castShadow = shelves.castShadow = true; bins.receiveShadow = shelves.receiveShadow = true;
    scene.add(bins); scene.add(shelves);
    // ポリ箱の置き台（スタート側）と、そろえた箱の置き台（エンド側）。機体の後ろ側
    var stand = new THREE.Group(); stand.position.set(X0 - 1.25, 0, LN); scene.add(stand);
    box(stand, 0.55, 0.04, 0.5, '#8b98a4', 0, 0.74, 0); [-1, 1].forEach(function (sx) { [-1, 1].forEach(function (sz) { box(stand, 0.03, 0.74, 0.03, '#8b98a4', sx * 0.25, 0.37, sz * 0.22); }); }); shade(stand);
    var outC = new THREE.Group(); outC.position.set(X0 - 1.25, 0, LS); scene.add(outC);
    box(outC, 0.55, 0.04, 0.5, '#c2577f', 0, 0.74, 0); [-1, 1].forEach(function (sx) { [-1, 1].forEach(function (sz) { box(outC, 0.03, 0.74, 0.03, '#8b98a4', sx * 0.25, 0.37, sz * 0.22); }); }); shade(outC);
    var POLY = { x: 0.36, y: 0.2, z: 0.28 };
    function polyBox() {                     // 半透明のポリ箱
      var g = new THREE.Group();
      var m = new THREE.Mesh(new THREE.BoxGeometry(POLY.x, POLY.y, POLY.z), new THREE.MeshStandardMaterial({ color: '#dfe9f1', transparent: true, opacity: 0.55, roughness: 0.2 }));
      g.add(m); g.add(new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), new THREE.LineBasicMaterial({ color: '#8fa6ba' })));
      g.userData = { size: POLY, n: 0 }; return g;
    }
    var TONES = ['#e5832d', '#3C9A5F', '#8C6BB1', '#C2577F', '#E8A33D', '#5b6670'];
    function smallPart(k) {                  // 小物部品（100g〜2kg）
      var g = new THREE.Group(), c = TONES[k % TONES.length];
      if (k % 3 === 0) cyl(g, 0.04, 0.08, c, 0, 0, 0, 'y'); else box(g, 0.09, 0.06, 0.07 + (k % 2) * 0.03, c, 0, 0, 0);
      g.userData = { size: { x: 0.09, y: 0.07, z: 0.08 } }; return shade(g);
    }
    var nextBox = polyBox(); scene.add(nextBox); nextBox.position.set(X0 - 1.25, 0.86, LN);
    var outs = [], kits = 0, cur = null, k = 0;
    var DECK = V3(-0.2, 0.86, 0.2);                                       // 天面のポリ箱の置き場所（アームの付け根の後ろ横）
    var SLOT = [[-0.1, -0.06], [0, -0.06], [0.1, -0.06], [-0.1, 0.06], [0, 0.06], [0.1, 0.06]];
    function binAt(side, i, li) {           // 間口 i・段 li の箱の手前（取る位置）
      var face = side === 'n' ? 1 : -1, zc = side === 'n' ? ZN : ZS;
      return V3(X0 + (i + 0.5) * P - 0.17, LV[li] + 0.24, zc + face * 0.32);
    }
    var bot = Bot(X0 - 0.45, LN, 0);
    function pickTo(side, i, li) {          // 表示灯の点いた間口へ走って、部品を1つ取り、天面のポリ箱へ入れる
      var lamp = lamps[side + i + '-' + li], part0 = null, ln = side === 'n' ? LN : LS;
      bot.go(X0 + (i + 0.5) * P - 0.17, ln);
      bot.call(function () { lamp.emissiveIntensity = 1.2; part0 = smallPart(k++); scene.add(part0); part0.position.copy(binAt(side, i, li)); });
      bot.pick(function () { return part0; }, function () { return binAt(side, i, li); });
      bot.call(function () { lamp.emissiveIntensity = 0; });
      bot.armTo(function () { return cur.localToWorld(V3(0, 0.36, 0)); }, 0.7);   // ポリ箱の上から入れる
      bot.call(function () { var o = bot.held, s2 = SLOT[cur.userData.n++ % SLOT.length]; bot.held = null; cur.attach(o); o.position.set(s2[0], -0.04, s2[1]); o.rotation.set(0, 0, 0); });
      bot.grip(1);
    }
    bot.script = function () {
      // スタート：空のポリ箱を後ろの置き台から取り、天面へ
      bot.pick(function () { return nextBox; }, function () { return nextBox.position.clone(); });
      bot.armTo(function () { return bot.R.g.localToWorld(DECK.clone().add(V3(0, 0.42, 0))); }, 0.8);
      bot.call(function () { cur = bot.held; bot.held = null; bot.R.g.attach(cur); cur.position.copy(DECK); cur.rotation.set(0, 0, 0); });
      bot.grip(1);
      bot.call(function () { nextBox = polyBox(); scene.add(nextBox); nextBox.position.set(X0 - 1.25, 0.86, LN); });
      // 行き（北側の棚）→ 奥で折り返し → 帰り（南側の棚）。取る間口は毎回変える
      var pickN = [], pickS = [];
      while (pickN.length < 3) { var a = Math.floor(Math.random() * N); if (pickN.indexOf(a) < 0) pickN.push(a); }
      while (pickS.length < 3) { var c = Math.floor(Math.random() * N); if (pickS.indexOf(c) < 0) pickS.push(c); }
      pickN.sort(function (p, q) { return p - q; }).forEach(function (i) { pickTo('n', i, 1 + Math.floor(Math.random() * 2)); });
      bot.go(XE + 0.2, LN); bot.turn(-Math.PI / 2); bot.go(XE + 0.2, LS); bot.turn(-Math.PI);
      pickS.sort(function (p, q) { return q - p; }).forEach(function (i) { pickTo('s', i, 1 + Math.floor(Math.random() * 2)); });
      // エンド：そろえたポリ箱を後ろの置き台へ
      bot.go(X0 - 0.45, LS);
      bot.pick(function () { return cur; }, function () { return cur.getWorldPosition(V3()); });
      bot.place(function () { return V3(X0 - 1.25, 0.86, LS + (outs.length % 2 ? 0.12 : -0.12)); }, function (o) { outs.push(o); kits++; if (outs.length > 2) scene.remove(outs.shift()); });
      bot.turn(-Math.PI * 1.5); bot.go(X0 - 0.45, LN); bot.turn(-Math.PI * 2);
      bot.call(function () { bot.h = 0; bot.lastH = 0; });
    };
    cells.push({ name: '完成部品のセットパック', short: 'セットパック', view: { az: 0.15, el: 1.2, w: 4.6, d: 1.6 }, at: V3(X0 + N * P / 2 - 0.4, 0.8, 3.0), bot: bot, tick: function () {} });
  })();

  /* ⑤ 生産ライン横の部品供給：詳しい表示（supply.html）と同じ棚・MoMa・作業者・動きを、そのまま工場の中に置く
     （supply-model.js。別の簡易モデルにすると、寄ったときに見え方がつながらないため） */
  (function () {
    var X = 9.6, LINE_S = -6.95;                                                          // 棚の列の中心と、組立ラインのコンベヤの南の端
    box(scene, 14, 0.25, 2.1, '#cfd6dc', 8.5, 0.125, -8.0);                                // 組立ラインのコンベヤ
    for (var k = 0; k < 14; k++) box(scene, 0.04, 0.02, 2.1, '#b8c2ca', 2 + k, 0.26, -8.0);
    var cars = [3.5, 9.2, 14.9].map(function (x) { var c = car('#f4f5f6'); c.position.set(x, 0.25, -8.0); scene.add(c); return c; });
    var lamps = andon(8.5, -8.0, 4);
    var g = new THREE.Group(); scene.add(g);
    var m = window.SupplyModel ? window.SupplyModel(g) : null;
    var Z0 = m ? LINE_S + m.area.lz : -5.45;                                               // 人の作業域の北の端をコンベヤにそろえる
    g.position.set(X, 0, Z0);
    var at = m ? V3(X + m.center.x, m.center.y - 0.45, Z0 + m.center.z) : V3(X, 0.65, -4.6);
    var bot = { step: function () {}, pose: function () {} };                             // MoMa は supply-model.js の中で動く
    cells.push({ name: '生産ライン横の部品供給', short: 'ライン横の部品供給', view: { az: 1.36, el: 0.4, w: 1.2, d: 1.5, same: m ? { span: m.span } : null }, at: at, bot: bot,
      tick: function (dt) {
        cars.forEach(function (c) { c.position.x += dt * 0.22; if (c.position.x > 16.6) c.position.x -= 17.1; c.visible = c.position.x > 0.2; });
        if (m) m.tick(dt);
        lamps.forEach(function (l, i) { l.emissiveIntensity = (i + Math.floor(clock / 2)) % 8 === 0 ? 1 : 0.5; });
      } });
  })();

  /* ---------------- 使いどころの札（全体のときだけ。押すとその使いどころへ寄る） ---------------- */
  var tags = cells.map(function (c, i) {
    var t = document.createElement('button'); t.type = 'button'; t.className = 'tag3d';
    t.textContent = '①②③④⑤'[i] + ' ' + c.short;
    t.addEventListener('click', function () { focus(i); });
    host.appendChild(t); return t;
  });

  /* ---------------- カメラ：全体（俯瞰）と、使いどころへの寄り ---------------- */
  var ALL = { target: V3(0.4, 0, -1.0), el: 1.02, az: 0.08, pts: [] };
  [-13.6, 14.4].forEach(function (x) { [-9.0, 6.6].forEach(function (z) { [0, 1.2].forEach(function (y) { ALL.pts.push(V3(x, y, z)); }); }); });
  function zoneView(c) {   // c.view：見る向き（az）・高さ（el）・入れる範囲（w×d）。side は横から
    var o = c.view || (c.side ? { az: 1.15, el: 0.5, w: 1.7, d: 1.7 } : { az: 0.35, el: 0.6, w: 1.7, d: 1.7 });
    var v = { target: c.at.clone(), el: o.el, az: o.az, pts: [], same: o.same };
    [-o.w, o.w].forEach(function (x) { [-o.d, o.d].forEach(function (z) { [-0.8, 1.3].forEach(function (y) { v.pts.push(c.at.clone().add(V3(x, y, z))); }); }); }); return v; }
  var views = cells.map(zoneView);
  function camPos(v, dist) { var d = V3(Math.sin(v.az) * Math.cos(v.el), Math.sin(v.el), Math.cos(v.az) * Math.cos(v.el)); return v.target.clone().addScaledVector(d, dist); }
  function fitDist(v) {                  // 要所がすべて入る、いちばん近い距離（下は作業名の帯の分あける）
    for (var dist = 3; dist < 120; dist *= 1.03) {
      camera.position.copy(camPos(v, dist)); camera.lookAt(v.target); camera.updateMatrixWorld(true);
      if (v.pts.every(function (p) { var q = p.clone().project(camera); return q.z < 1 && Math.abs(q.x) < 0.97 && q.y < 0.92 && q.y > -0.6; })) return dist;
    }
    return dist;
  }
  // 見る人の操作：回す（userAz）・傾ける（userEl）・寄る（userZoom）・ずらす（userPan）
  var now = -1, cam = { from: null, t: 1, look: V3() }, userAz = 0, userEl = 0, userZoom = 1, userPan = V3();
  function settle() {
    var v = now < 0 ? ALL : views[now], t = v.target.clone().add(userPan);
    return { pos: camPos({ target: t, el: clamp(v.el + userEl, 0.15, 1.5), az: v.az + userAz }, v.dist * userZoom), look: t };
  }
  function resetUser() { userAz = 0; userEl = 0; userZoom = 1; userPan.set(0, 0, 0); }
  function touched() { if (ui && ui.user) ui.user(); }   // 見る人が操作した（見て回るのを少し止める）
  function focus(i) {
    if (i === now) return;
    now = i; resetUser();
    cam.from = { pos: camera.position.clone(), look: cam.look.clone() }; cam.t = 0;
    tags.forEach(function (t) { t.style.display = i < 0 ? '' : 'none'; });
    if (ui && ui.view) ui.view(i);
  }
  function placeCam(dt) {
    var to = settle();
    if (cam.t < 1 && cam.from) {
      cam.t = Math.min(1, cam.t + dt / 1.4); var e = ease(cam.t);
      camera.position.copy(cam.from.pos).lerp(to.pos, e); cam.look.copy(cam.from.look).lerp(to.look, e);
    } else { camera.position.copy(to.pos); cam.look.copy(to.look); }
    camera.lookAt(cam.look);
  }
  function placeTags() {
    if (now >= 0) return;
    var w = host.clientWidth, h = host.clientHeight;
    cells.forEach(function (c, i) {
      var q = c.at.clone().add(V3(0, 1.9, 0)).project(camera), t = tags[i];
      var half = t.offsetWidth / 2, px = clamp((q.x + 1) / 2 * w, half + 4, w - half - 4);
      t.style.transform = 'translate(' + Math.round(px - half) + 'px,' + Math.round((1 - q.y) / 2 * h) + 'px) translateY(-100%)';
    });
  }
  // 詳しい表示（supply.html）の「横から」と同じ見え方にする（同じ計算。画角の違い 38° と 32° の分だけ離す）
  function sameView(v) {
    var a = camera.aspect, f = 1.1 * v.same.span * (a < 1 ? 1.7 : a < 1.3 ? 1.25 : 1);
    var x = 6.0 * f, y = 2.7, z = 1.3 * f, r = Math.sqrt(x * x + y * y + z * z);
    v.az = Math.atan2(x, z); v.el = Math.asin(y / r); v.dist = r * Math.tan(19 * Math.PI / 180) / Math.tan(16 * Math.PI / 180);
  }
  function resize() {
    var w = host.clientWidth || 300, h = host.clientHeight || 200;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%';
    camera.aspect = w / h; camera.updateProjectionMatrix();
    ALL.dist = fitDist(ALL); views.forEach(function (v) { if (v.same) sameView(v); else v.dist = fitDist(v); });
  }
  /* 操作：左ドラッグで回す・傾ける／右ドラッグか Shift＋ドラッグでずらす／一度押したあとホイールで寄る（ページのスクロールを妨げない）／
     スマホは横のスワイプで回す（縦はページのスクロール）。＋・－・元に戻すは zoom()・reset() から */
  var drag = null, el = renderer.domElement, armed = false;
  el.style.touchAction = 'pan-y';
  el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  el.addEventListener('pointerdown', function (e) {
    armed = true;
    drag = { x: e.clientX, y: e.clientY, az: userAz, el: userEl, pan: userPan.clone(), move: e.button === 2 || e.shiftKey, touch: e.pointerType === 'touch' };
    touched();
  });
  window.addEventListener('pointermove', function (e) {
    if (!drag) return;
    var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (drag.move) {                       // 床に沿ってずらす（画面の右と奥の向きへ）
      var v = now < 0 ? ALL : views[now], k = v.dist * userZoom * 0.0016, a = v.az + userAz;
      userPan.copy(drag.pan).add(V3(-Math.cos(a) * dx * k - Math.sin(a) * dy * k, 0, Math.sin(a) * dx * k - Math.cos(a) * dy * k));
    } else {
      userAz = drag.az - dx * 0.006;
      if (!drag.touch) userEl = clamp(drag.el + dy * 0.004, -0.5, 0.6);
    }
    placeCam(0); render(); touched();
  });
  window.addEventListener('pointerup', function () { drag = null; });
  el.addEventListener('pointerleave', function () { if (!drag) armed = false; });
  el.addEventListener('wheel', function (e) {
    if (!armed && !e.ctrlKey) return;      // 押す前はページのスクロールのまま
    e.preventDefault(); zoom(Math.exp(e.deltaY * 0.0012));
  }, { passive: false });
  function zoom(f) { userZoom = clamp(userZoom * f, 0.3, 2.5); placeCam(0); render(); touched(); }
  if (window.ResizeObserver) new ResizeObserver(function () { resize(); placeCam(0); render(); }).observe(host);

  function render() { renderer.render(scene, camera); placeTags(); }
  resize();
  cells.forEach(function (c) { c.bot.pose(); });
  cam.look.copy(ALL.target); placeCam(0); render();
  if (ui && ui.view) ui.view(-1);

  return {
    names: cells.map(function (c) { return c.name; }),
    focus: focus,
    zoom: zoom,
    reset: function () { resetUser(); placeCam(0); render(); },
    tick: function (dt, camDt) {   // dt：動きの進み（倍速込み）、camDt：カメラの寄りの進み（実時間）
      dt = Math.min(dt, 0.1);
      clock += dt;
      cells.forEach(function (c) { c.bot.step(dt); c.tick(dt); c.bot.pose(); });
      placeCam(camDt == null ? dt : camDt); render();
    }
  };
};
