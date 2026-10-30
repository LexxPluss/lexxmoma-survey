/* ピッキング → 移動 → プレイスを、機種ごとのレーンに並べて 3D で見せる。
   機体の形は moma-model.js（先に読み込む）。
   使い方：var s = MomaScene(要素, MODELS, ARM); s.build(距離m, plans); s.update(秒); */
window.MomaScene = function (host, MODELS, ARM) {
  if (!window.THREE) return null;
  var V3 = function (x, y, z) { return new THREE.Vector3(x || 0, y || 0, z || 0); };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var ease = function (t) { t = clamp(t, 0, 1); return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; };
  var BOX = { x: 0.335, y: 0.149, z: 0.335 };          // 運ぶ箱（moma-model.js と同じ）
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

  var M = MomaModel(), mat = M.mat, box = M.box, BODIES = M.BODIES;

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
      ln.tag.textContent = (ln.m.short || ln.m.name) + '  ' + Math.min(t, p.total).toFixed(1) + '秒' + (both ? '　走りながら作業' : '');
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
