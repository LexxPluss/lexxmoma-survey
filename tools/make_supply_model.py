"""shooter-concept.html（社内の検討用ビューア）から、工場全体の3Dに「部品供給」の棚・MoMa・動きをそのまま置くための
content/pages/supply-model.js を作る。詳しい表示（supply.html）と同じモデル・寸法・動きのコードを使うので、
全体から寄っても同じものが見える（別の簡易モデルにしない）。
  見出し・右パネル・部位ラベル・寸法・字幕は使わない／床・格子・組立ラインは工場側のものを使う
使い方：python tools/make_supply_model.py 元のhtml 出力先js
読み込む側：var m = SupplyModel(THREE.Group)  →  m.tick(秒)・m.center・m.span・m.area（床の範囲）
"""
import sys

src, dst = sys.argv[1], sys.argv[2]
s = open(src, encoding='utf-8').read()

# 1つ目の <script>：寸法の設定（CONFIG・REACH）
a = s.index('<script>\n') + len('<script>\n')
part1 = s[a:s.index('</script>', a)]
# 2つ目：部品・動きのコード（右パネル・画面の部分の手前まで）
b = s.index("'use strict';\n", s.index('three.min.js')) + len("'use strict';\n")
part2 = s[b:s.index('/* ===================== 数値・右パネル', b)]


def rep(a, b_, count=1):
    global part2
    n = part2.count(a)
    assert n == count, (n, a[:80])
    part2 = part2.replace(a, b_)


rep("const labelLayer = document.getElementById('labels');",
    "const labelLayer = document.createElement('div');   // 工場全体の中では部位ラベルを出さない")
rep('let VERIFY = null;', 'let VERIFY = { hits: [], total: Infinity, frames: 0, ms: 0, stances: [] };   // 干渉の確認（右パネル用）は省く')
rep("function setCaption(n, N, t, who) { $('#caption .n').textContent = n ? `手順 ${n}/${N}` : ''; $('#caption .t').textContent = t; $('#caption').classList.toggle('human', who === 'human'); }",
    'function setCaption() { }   // 字幕は出さない')
rep("const stage = $('#stage'), panel = $('#panel'), compare = $('#compare');", '')
# 床・格子・組立ラインは工場側のものを使う（二重にしない）
rep("fl.position.set((xMin + xMax) / 2, 0, (o.zB + aw - lz) / 2); root.add(fl);", "fl.position.set((xMin + xMax) / 2, 0, (o.zB + aw - lz) / 2);")
rep("grid.position.set(0, 0.001, (o.zB + aw - lz) / 2); root.add(grid);", "grid.position.set(0, 0.001, (o.zB + aw - lz) / 2);")
rep("  const ln = addBox(root, xMax - xMin, 0.42, 0.7, '#dfe4e8', (xMin + xMax) / 2, 0.21, -lz - 0.45);\n  addBox(root, xMax - xMin, 0.02, 0.6, '#b8c2ca', (xMin + xMax) / 2, 0.43, -lz - 0.45);\n", '')
rep("  return { xMin, xMax, lz, aw };\n}", "  AREA = { xMin, xMax, lz, aw, zB: o.zB };\n  return { xMin, xMax, lz, aw };\n}")

# 工場の中では画面の外へ消えないので、MoMa は通路の端の部品置き場から出て、同じ場所へ戻り、向きを変えてからくり返す
# （詳しい表示では左端から出て右端へ去るため、くり返すときに瞬間移動して見えた）
rep("m.g.rotation.y = 0; m.g.position.set(stLR.x - 4.3, 0, stLR.zT);", "m.g.rotation.y = Math.PI; m.g.position.set(stLR.x + 4.3, 0, stLR.zT);", 2)
rep("    A.drive(m, stLR.x + 4.3, 2.4, 'MoMaは部品置き場へ（空箱を下ろし、次の品番の箱を2箱積む）'),\n",
    "    A.drive(m, stLR.x + 4.3, 2.4, 'MoMaは部品置き場へ（空箱を下ろし、次の品番の箱を2箱積む）'),\n    A.turn(m, Math.PI, 1.4, '部品置き場で向きを変える'),\n")

# buildMain が使う、右パネル側の小さな関数
part2 += "const f1 = v => (Math.round(v * 10) / 10).toFixed(1);\n"

out = """/* このファイルは tools/make_supply_model.py が shooter-concept.html から作ります。手で直さないでください。
   工場全体の3D（scene3d.js）の「生産ライン横の部品供給」に、詳しい表示（supply.html）と同じ棚・MoMa・動きを置く。 */
window.SupplyModel = (function () {
'use strict';
let AREA = null;
""" + part1 + part2 + """
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
"""
open(dst, 'w', encoding='utf-8', newline='\n').write(out)
print('ok', len(out))
