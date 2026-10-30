/* ピッキング → 移動 → プレイスを、機種ごとのレーンに並べて 3D で見せる。
   LexxMoMa の形は content/pages/shooter-concept.html の makeMoMa（台車＋アームの簡易形状）を元にしています。
   使い方：var s = MomaScene(要素, MODELS, ARM); s.build(距離m, plans); s.update(秒); */
window.MomaScene = function (host, MODELS, ARM) {
  if (!window.THREE) return null;
  var V3 = function (x, y, z) { return new THREE.Vector3(x || 0, y || 0, z || 0); };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var ease = function (t) { t = clamp(t, 0, 1); return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; };
  var BLUE = '#0068B7', GREY = '#7d8b96', DARK = '#25323c';
  var BASE = { L: 1.0, W: 0.7, H: 0.4, reach: 1.3, tool: 0.15 };     // 台車・アームの寸法（shooter-concept と同じ仮値）
  var BOX = { x: 0.335, y: 0.149, z: 0.335 };                        // 運ぶ箱（TP-331.5B 相当）
  var LANE_GAP = 1.7, SHELF_TOP = 0.78;
  var FONT = '"Noto Sans JP","Hiragino Kaku Gothic ProN","Yu Gothic","Meiryo",sans-serif';

  var renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true }); } catch (e) { return null; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  host.appendChild(renderer.domElement);
  var scene = new THREE.Scene();
  scene.background = new THREE.Color('#f4f7fa');
  var camera = new THREE.PerspectiveCamera(30, 2, 0.1, 200);
  scene.add(new THREE.HemisphereLight('#ffffff', '#c9d3db', 0.95));
  var sun = new THREE.DirectionalLight('#ffffff', 0.55); sun.position.set(4, 10, 8); scene.add(sun);

  var _mc = {};
  function mat(color) { return _mc[color] || (_mc[color] = new THREE.MeshStandardMaterial({ color: color, roughness: 0.72, metalness: 0.05 })); }
  function addBox(parent, sx, sy, sz, color, x, y, z) {
    var b = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), typeof color === 'string' ? mat(color) : color);
    b.position.set(x, y, z); parent.add(b); return b;
  }
  function textMat(text, o) {
    var c = document.createElement('canvas'); c.width = o.w || 512; c.height = o.h || 96;
    var g = c.getContext('2d');
    g.fillStyle = o.bg || '#fff'; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = o.fg || '#1f2933'; g.textAlign = o.align || 'center'; g.textBaseline = 'middle';
    g.font = '700 ' + (o.font || 44) + 'px ' + FONT;
    g.fillText(text, o.align === 'left' ? 16 : c.width / 2, c.height / 2);
    var t = new THREE.CanvasTexture(c); t.anisotropy = 4;
    return new THREE.MeshBasicMaterial({ map: t, transparent: !!o.transparent });
  }

  /* ---- LexxMoMa（台車＋アーム）。shooter-concept.html の makeMoMa を簡略化 ---- */
  function makeRobot(color, plate) {
    var L = BASE.L, W = BASE.W, H = BASE.H, tl = BASE.tool, L1 = BASE.reach / 2, L2 = BASE.reach / 2;
    var g = new THREE.Group();
    var body = mat(color), light = mat(new THREE.Color(color).lerp(new THREE.Color('#fff'), 0.3).getStyle()), dark = mat(DARK),
        white = mat('#f4f6f8'), joint = mat('#a9bccb'), toolM = mat('#56636e');
    addBox(g, L, H - 0.1, W, body, 0, 0.1 + (H - 0.1) / 2, 0);
    addBox(g, L + 0.01, 0.025, W + 0.01, light, 0, H - 0.012, 0);
    addBox(g, L - 0.04, 0.08, W - 0.04, dark, 0, 0.07, 0);
    var wheels = [];
    [-1, 1].forEach(function (sx) { [-1, 1].forEach(function (sz) {
      var w = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 16), dark);
      w.rotation.x = Math.PI / 2; w.position.set(sx * (L / 2 - 0.16), 0.07, sz * (W / 2 - 0.06)); g.add(w); wheels.push(w);
    }); });
    var stM = new THREE.MeshStandardMaterial({ color: '#8fdcff', emissive: '#2fa8ff', emissiveIntensity: 0.8 });
    [-1, 1].forEach(function (sz) { addBox(g, L * 0.7, 0.022, 0.01, stM, 0, H - 0.055, sz * (W / 2 + 0.006)); });
    if (plate) {
      var p = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.11), textMat('LexxMoMa', { bg: BLUE, fg: '#fff', font: 40, w: 256, h: 64 }));
      p.position.set(-0.12, 0.24, W / 2 + 0.002); g.add(p);
    }
    // アーム（根元は台車の前寄り・棚の側）
    var root = new THREE.Group(); root.position.set(L / 4, H, -W / 2 + 0.2); g.add(root);
    addBox(root, 0.2, 0.03, 0.2, joint, 0, 0.015, 0);
    var yaw = new THREE.Group(); root.add(yaw);
    var tur = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.16, 20), white); tur.position.y = 0.1; yaw.add(tur);
    var sh = new THREE.Group(); sh.position.y = 0.2; yaw.add(sh);
    var jc = function (r) { var c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.13, 20), joint); c.rotation.x = Math.PI / 2; return c; };
    sh.add(jc(0.07)); addBox(sh, L1, 0.085, 0.085, white, L1 / 2, 0, 0);
    var el = new THREE.Group(); el.position.x = L1; sh.add(el); el.add(jc(0.06)); addBox(el, L2, 0.07, 0.07, white, L2 / 2, 0, 0);
    var wpg = new THREE.Group(); wpg.position.x = L2; el.add(wpg); wpg.add(jc(0.05));
    var wy = new THREE.Group(); wpg.add(wy);
    wy.add(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.08, 16), joint));
    var tg = new THREE.Group(); wy.add(tg);
    addBox(tg, tl - 0.04, 0.07, 0.08, toolM, 0.02 + (tl - 0.04) / 2, 0, 0);
    addBox(tg, 0.05, 0.035, 0.05, '#111', tl * 0.45, 0.06, 0);
    addBox(tg, 0.025, 0.05, BOX.x + 0.08, toolM, tl - 0.0125, 0, 0);
    var fl = Math.min(0.12, BOX.z * 0.4), fingers = [-1, 1].map(function (s) {
      return addBox(tg, fl, 0.05, 0.012, BLUE, tl + fl / 2, 0, s * (BOX.x / 2 + 0.035));
    });
    return {
      g: g, wheels: wheels, lastX: 0,
      shoulderW: function () { root.updateWorldMatrix(true, false); return root.localToWorld(V3(0, 0.2, 0)); },
      ik: function (w) {   // 手首の位置 w（ワールド座標）に合わせて関節を回す。手先は常に -z（棚の方向）
        var s = this.shoulderW(), dx = w.x - s.x, dz = w.z - s.z, dy = w.y - s.y, r = Math.hypot(dx, dz), d = Math.hypot(r, dy);
        var max = L1 + L2 - 1e-4; if (d > max) { r *= max / d; dy *= max / d; d = max; }
        var psi = Math.atan2(-dz, dx), a2 = Math.acos(clamp((d * d - L1 * L1 - L2 * L2) / (2 * L1 * L2), -1, 1));
        var a1 = Math.atan2(dy, r) + Math.atan2(L2 * Math.sin(a2), L1 + L2 * Math.cos(a2));
        yaw.rotation.y = psi; sh.rotation.z = a1; el.rotation.z = -a2; wpg.rotation.z = -(a1 - a2); wy.rotation.y = Math.PI / 2 - psi;
      },
      setFingers: function (open) { fingers.forEach(function (f, i) { f.position.z = (i ? 1 : -1) * (BOX.x / 2 + 0.008 + 0.027 * open); }); },
      spin: function () { var dx = g.position.x - this.lastX; this.lastX = g.position.x; wheels.forEach(function (w) { w.rotation.y -= dx / 0.07; }); },
      setStatus: function (c) { stM.color.set(c); stM.emissive.set(c); }
    };
  }

  function makeShelf(parent, x, z) {
    var top = SHELF_TOP, w = 0.6, d = 0.5, frame = mat('#d9d3c0');
    addBox(parent, w, 0.03, d, frame, x, top - 0.015, z);
    [-1, 1].forEach(function (sx) { [-1, 1].forEach(function (sz) { addBox(parent, 0.035, top, 0.035, frame, x + sx * (w / 2 - 0.02), top / 2, z + sz * (d / 2 - 0.02)); }); });
  }
  function makeBox(color) {
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
    var n = MODELS.length, depth = (n - 1) * LANE_GAP;
    var floor = new THREE.Mesh(new THREE.PlaneGeometry(d + 3, depth + 3), mat('#ffffff'));
    floor.rotation.x = -Math.PI / 2; floor.position.set(d / 2, 0, -depth / 2); world.add(floor);
    MODELS.forEach(function (m, i) {
      var z = -i * LANE_GAP;                        // 手前から順に並べる
      var shelfZ = z - (BASE.W / 2 + 0.12 + 0.25);
      // レーンの線と名前
      var line = new THREE.Mesh(new THREE.PlaneGeometry(d + 1.4, 0.02), new THREE.MeshBasicMaterial({ color: m.ours ? BLUE : '#b7c3cd' }));
      line.rotation.x = -Math.PI / 2; line.position.set(d / 2, 0.002, z + BASE.W / 2 + 0.12); world.add(line);
      makeShelf(world, 0, shelfZ);
      makeShelf(world, d, shelfZ);
      var robot = makeRobot(m.ours ? BLUE : GREY, m.ours);
      world.add(robot.g);
      var box = makeBox(m.ours ? '#2f6fb3' : '#c27a12');
      world.add(box);
      var boxA = V3(0, SHELF_TOP + BOX.y / 2, shelfZ), boxB = V3(d, SHELF_TOP + BOX.y / 2, shelfZ);
      var tag = document.createElement('div');
      tag.className = 'tag3d' + (m.ours ? ' ours' : '');
      host.appendChild(tag);
      lanes.push({ m: m, p: plans[i], z: z, robot: robot, box: box, boxA: boxA, boxB: boxB, tag: tag,
                   label: (m.short || m.name) + (m.sub ? '・' + m.sub.replace('同時動作', '同時') : '') });
    });
    resize();
    fit(d, depth);
    update(0);
  }

  // 箱の中心 → その箱をつかむときの手首の位置
  function wristFor(c) { return c.clone().add(V3(0, 0, BASE.tool + BOX.z / 2)); }
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
      var p = ln.p, R = ln.robot, x = baseX(p, t);
      R.g.position.set(x - BASE.L / 4, 0, ln.z);   // アームの根元が棚の正面に来る位置
      R.spin();
      R.g.updateMatrixWorld(true);
      var s = R.shoulderW();
      var home = s.clone().add(V3(0.02, 0.45, 0.1));
      var carry = s.clone().add(V3(0.05, 0.32, 0.12));
      var A = wristFor(ln.boxA), Aup = A.clone().add(V3(0, 0.18, 0.1));
      var B = wristFor(ln.boxB), Bup = B.clone().add(V3(0, 0.18, 0.1));
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
      R.ik(w);
      R.setFingers(clamp(open, 0, 1));
      if (held) ln.box.position.copy(w).add(V3(0, 0, -(BASE.tool + BOX.z / 2)));
      else ln.box.position.copy(placed ? ln.boxB : ln.boxA);
      R.setStatus(t >= p.total ? '#3EB370' : (t > p.moveStart && t < p.moveEnd ? '#2fa8ff' : '#8fdcff'));
    });
    renderer.render(scene, camera);
    placeTags(t);
  }

  // 棚・台車・名札がすべて入る、いちばん近いカメラ位置を探す（手前・斜め上から）
  var fitArgs = null;
  function fit(d, depth) {
    fitArgs = [d, depth];
    var target = V3(d / 2, 0.4, -depth / 2 - 0.35), el = 38 * Math.PI / 180;
    var dir = V3(0, Math.sin(el), Math.cos(el)), pts = [];
    [-1.0, d + 0.8].forEach(function (x) { [-depth - 1.3, 0.8].forEach(function (z) { [0, 1.9].forEach(function (y) { pts.push(V3(x, y, z)); }); }); });
    for (var dist = 2; dist < 200; dist *= 1.03) {
      camera.position.copy(target).addScaledVector(dir, dist);
      camera.lookAt(target); camera.updateMatrixWorld(true);
      if (pts.every(function (p) { var q = p.clone().project(camera); return q.z > -1 && q.z < 1 && Math.abs(q.x) < 0.96 && Math.abs(q.y) < 0.94; })) break;
    }
  }
  function placeTags(t) {
    var w = host.clientWidth, h = host.clientHeight;
    lanes.forEach(function (ln) {
      var q = ln.robot.g.position.clone().add(V3(BASE.L / 4, 1.75, -0.2)).project(camera);
      var done = t >= ln.p.total;
      ln.tag.textContent = ln.label + '  ' + Math.min(t, ln.p.total).toFixed(1) + '秒';
      ln.tag.classList.toggle('done', done);
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

  return { build: build, update: update };
};
