"""shooter-concept.html（社内の検討用ビューア）から、アンケートに埋め込む「部品供給」の表示だけを作る。
モデル・寸法・動きのコードはそのまま使い、見せ方だけを変える：
  見出し・右パネル・凡例・操作ボタン・部位ラベル・寸法・手順の字幕を出さない／ホイールで拡大しない（ページのスクロールを妨げない）
  三次元の部品は同じサイトの vendor/three.min.js／見えていないときは止める／1回分の手順が終わったら親の画面へ知らせる
使い方：python make_supply.py 元のhtml 出力先html
"""
import sys

src, dst = sys.argv[1], sys.argv[2]
s = open(src, encoding='utf-8').read()


def rep(a, b, count=1):
    global s
    n = s.count(a)
    assert n == count, (n, a[:80])
    s = s.replace(a, b)


rep('<title>シューター本案（縦型・高さ活用）</title>', '<title>生産ライン横の部品供給</title>')
rep('<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>',
    '<script src="vendor/three.min.js?r128"></script>')
# 埋め込み用の見せ方（元のスタイルの最後に足す）
rep('</style>\n</head>', '''/* アンケートに埋め込むとき：3D だけを出す */
header,#panel,#legend,.ctrl,#clr,#caption,#compare{display:none!important}
main{height:100vh;min-height:0}
#stage canvas{touch-action:pan-y}
</style>
</head>''')
rep('<label><input type="checkbox" id="chkLbl" checked>部位ラベル</label>', '<label><input type="checkbox" id="chkLbl">部位ラベル</label>')
rep('<label><input type="checkbox" id="chkDim" checked>寸法</label>', '<label><input type="checkbox" id="chkDim">寸法</label>')
# ホイールでの拡大はしない
rep("    dom.addEventListener('wheel', e => { e.preventDefault(); this.zoom(Math.exp(e.deltaY * 0.0012)); }, { passive: false });\n", '')
# 読み込み時の全手順の干渉確認（右パネル用）は省く
rep('let VERIFY = null;', 'let VERIFY = { hits: [], total: Infinity, frames: 0, ms: 0, stances: [] };   // 埋め込みでは右パネルを出さないので確認を省く')
# 再生速度は ?speed= で、見えていないときは止める、1回分が終わったら知らせる
rep("let cur = 0, plan = null, tline = null, playing = true, speed = 1, endWait = 0, cmpMode = false;",
    "let cur = 0, plan = null, tline = null, playing = true, speed = +(location.search.match(/[?&]speed=([\\d.]+)/) || [])[1] || 1, endWait = 0, cmpMode = false;\n"
    "function onScreen() {   // 埋め込みの枠が、外側の画面まで含めて見えているか\n"
    "  try { let w = window; while (w.frameElement) { const fe = w.frameElement; if (!fe.offsetParent) return false; const r = fe.getBoundingClientRect(); if (r.bottom < 0 || r.top > w.parent.innerHeight) return false; w = w.parent; } return document.visibilityState !== 'hidden'; }\n"
    "  catch (e) { return true; }\n"
    "}")
rep("""  if (cmpMode || !plan) return;
  if (playing) {
    if (!tline.done) tline.update(dt * speed);
    else { endWait += dt * speed; if (endWait > 1.6) loadPlan(cur, false); }
  }""", """  if (cmpMode || !plan || !onScreen()) return;
  if (playing) {
    if (!tline.done) tline.update(dt * speed);
    else {
      if (!endWait) try { parent.postMessage({ type: 'usecase-cycle-done' }, location.origin); } catch (e) { }
      endWait += dt * speed; if (endWait > 1.6) loadPlan(cur, false);
    }
  }""")
rep("""/* =====================================================================
   CONFIG（config.js 相当）""", """/* =====================================================================
   このファイルは make_supply.py が shooter-concept.html から作ったものです（アンケートの「部品供給」の表示）。
   モデル・寸法・動きを直すときは元の shooter-concept.html を直して、作り直してください。
   =====================================================================
   CONFIG（config.js 相当）""")
# 見る人が視点を動かしたら、外側（見学）に知らせて、次へ進むのを少し止めてもらう
rep("""    dom.addEventListener('pointerdown', e => { dom.setPointerCapture(e.pointerId);""",
    """    dom.addEventListener('pointerdown', e => { try { parent.postMessage({ type: 'usecase-user' }, location.origin); } catch (err) { } dom.setPointerCapture(e.pointerId);""")
# 下に作業名の帯が重なるので、景色を少し上へ寄せて、少し引く
rep("""  const t = plan.center, f = plan.span * (cam.aspect < 1 ? 1.7 : cam.aspect < 1.3 ? 1.25 : 1);""",
    """  const t = plan.center.clone().add(V3(0, -0.45, 0)), f = 1.1 * plan.span * (cam.aspect < 1 ? 1.7 : cam.aspect < 1.3 ? 1.25 : 1);   // 埋め込み：下の帯の分、景色を上へ""")
open(dst, 'w', encoding='utf-8', newline='\n').write(s)
print('ok', len(s))
