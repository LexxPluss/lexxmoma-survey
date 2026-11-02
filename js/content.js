/* content/items.md を読み込み、上段の「一般情報」と右側のカードを作る
 * 右側のカードは、フォームのセクションの進み具合に合わせて切り替える
 * 書き方は content/items.md の先頭の説明を参照 */
var Content = (function () {
  'use strict';

  var CFG = window.SURVEY_CONFIG || {};
  var KEYS = { '区分': 'kind', '時期': 'when', '画像': 'image', 'セクション': 'section', '質問': 'question', '埋め込み': 'embed', '高さ': 'embedH', '動画': 'video', '表示': 'place' };
  var DONE = 'done'; // 送信後

  var state = {
    cards: [],
    kind: 'すべて',
    sections: Math.max(0, Number(CFG.FORM_SECTIONS) || 0),
    titles: CFG.SECTION_TITLES || [],
    manual: true,      // ‹ › で手で合わせるか（自前の回答画面では不要）
    question: '',      // 回答画面で今見ている質問（例：Q5）
    current: 1,
    loads: 0
  };

  // 自前の回答画面のときは、ページ数と名前を質問データから受け取る
  function configure(o) {
    if (o.sections != null) state.sections = o.sections;
    if (o.titles) state.titles = o.titles;
    if (o.manual != null) state.manual = o.manual;
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // 太字・リンクだけ対応する（それ以外はそのまま文字として出す）
  function inline(s) {
    return esc(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  }

  // content/ からの相対パスを、画面から見たパスに直す
  function resolve(path, baseDir) {
    if (!path || /^(https?:)?\/\//.test(path) || path.charAt(0) === '/') return path;
    return baseDir + path;
  }

  // 別の HTML ページをカードの中に表示する（「大きく開く」で別の画面にも出せる）
  function embedHtml(c) {
    var h = parseInt(String(c.embedH).replace(/[０-９]/g, function (d) {
      return String.fromCharCode(d.charCodeAt(0) - 0xFEE0);
    }), 10) || 560;
    // 動画・画像と同じく、文章の下に出す。「埋め込み: a.html, b.html」のように並べると、上から順に出す
    return '<div class="card-embeds">' + c.embed.split(/\s*[,、]\s*/).filter(Boolean).map(function (src) {
      return '<div class="card-embed-box"><iframe src="' + esc(src) + '" title="' + esc(c.title) + '" loading="lazy" allow="fullscreen" allowfullscreen' +
        ' style="height:' + h + 'px"></iframe></div>';
    }).join('') + '</div>';
  }
  function embedLinks(c) {
    return c.embed.split(/\s*[,、]\s*/).filter(Boolean).map(function (src) {
      return '<a class="embed-open" href="' + esc(src) + '" target="_blank" rel="noopener">大きく開く ↗</a>';
    }).join(' ');
  }

  // 同じサイト内のページなら、中身の高さに合わせて枠を伸び縮みさせる（「高さ:」は読み込むまでの仮の高さ）
  function fitToContent(frame) {
    frame.addEventListener('load', function () {
      var body;
      try { body = frame.contentDocument && frame.contentDocument.body; } catch (e) { return; }
      if (!body || !window.ResizeObserver) return;
      new ResizeObserver(function () {
        var h = Math.ceil(body.getBoundingClientRect().height);
        if (h > 0) frame.style.height = h + 'px';
      }).observe(body);
    });
  }

  // 動画は音なしで自動再生・くり返し（同じ名前の .jpg があれば読み込み中に表示）
  function videoHtml(c) {
    return '<div class="card-video"><video src="' + esc(c.video) + '" poster="' + esc(c.video.replace(/\.mp4(\?.*)?$/, '.jpg')) + '"' +
      ' autoplay muted loop playsinline preload="metadata" aria-label="' + esc(c.title) + '"></video></div>';
  }

  // 「1」「1, 2」「送信後」などを読む
  function parseSections(text) {
    var out = [];
    String(text || '').replace(/[０-９]/g, function (c) {
      return String.fromCharCode(c.charCodeAt(0) - 0xFEE0);
    }).split(/[,、，\s]+/).forEach(function (t) {
      if (!t) return;
      if (t.indexOf('送信') >= 0) out.push(DONE);
      else if (/^\d+$/.test(t)) out.push(Number(t));
    });
    return out;
  }

  function parse(md, baseDir) {
    md = md.replace(/\r\n?/g, '\n').replace(/<!--[\s\S]*?-->/g, '');
    var cards = [];
    var parts = md.split(/^## +/m);
    // 最初の「## 」より前は一般情報。「# 」の行は見出しになる
    var intro = { title: '', html: '' };
    var head = parts[0].split('\n').filter(function (line) {
      var m = line.match(/^# +(.*)$/);
      if (m && !intro.title) { intro.title = m[1].trim(); return false; }
      return true;
    });
    intro.html = bodyHtml(head);
    parts.slice(1).forEach(function (chunk) {
      var lines = chunk.split('\n');
      var card = { title: lines.shift().trim(), kind: '', when: '', image: '', section: '', question: '', embed: '', embedH: '', video: '', place: '', body: [] };
      var inHead = true;
      lines.forEach(function (line) {
        var m = line.match(/^([^:：]{1,5})[:：]\s*(.*)$/);
        if (inHead && m && KEYS[m[1].trim()]) { card[KEYS[m[1].trim()]] = m[2].trim(); return; }
        var img = line.match(/^!\[[^\]]*\]\(([^)]+)\)\s*$/);
        if (img && !card.image) { card.image = img[1].trim(); return; }
        if (line.trim()) inHead = false;
        card.body.push(line);
      });
      card.image = resolve(card.image, baseDir);
      card.video = resolve(card.video, baseDir);
      card.embed = card.embed.split(/\s*[,、]\s*/).filter(Boolean).map(function (e) { return resolve(e, baseDir); }).join(',');
      card.sections = parseSections(card.section);
      card.questions = (card.question.replace(/[ＱＱ]/g, 'Q').replace(/[０-９]/g, function (d) {
        return String.fromCharCode(d.charCodeAt(0) - 0xFEE0);
      }).replace(/[－‐ー]/g, '-').match(/Q\d+(?:-\d+)?/gi) || []).map(function (x) { return x.toUpperCase(); });
      card.html = bodyHtml(card.body);
      cards.push(card);
    });
    return { intro: intro, cards: cards };
  }

  function bodyHtml(lines) {
    var html = '', para = [], list = [];
    function flush() {
      if (para.length) { html += '<p>' + para.map(inline).join('<br>') + '</p>'; para = []; }
      if (list.length) { html += '<ul>' + list.map(function (l) { return '<li>' + inline(l) + '</li>'; }).join('') + '</ul>'; list = []; }
    }
    lines.forEach(function (line) {
      var li = line.match(/^\s*[-・*]\s+(.*)$/);
      if (li) { if (para.length) flush(); list.push(li[1]); return; }
      if (!line.trim()) { flush(); return; }
      if (list.length) flush();
      para.push(line.trim());
    });
    flush();
    return html;
  }

  function tagClass(kind) {
    if (kind.indexOf('構想') >= 0 || kind.indexOf('展開') >= 0) return 'tag-vision';
    if (kind.indexOf('ヒント') >= 0) return 'tag-hint';
    if (kind.indexOf('事例') >= 0 || kind.indexOf('特徴') >= 0 || kind.indexOf('使いどころ') >= 0) return 'tag-case';
    if (kind.indexOf('結論') >= 0) return 'tag-vision';
    return 'tag-other';
  }

  // 上段：一般情報。「表示: 上段」のカードは、その右に補足として出す（右側の欄には出さない）
  function renderIntro(intro, side) {
    var box = document.getElementById('intro');
    if (!intro.title && !intro.html) { box.hidden = true; return; }
    box.innerHTML = '<div class="intro-main">' + (intro.title ? '<h1>' + inline(intro.title) + '</h1>' : '') +
      '<div class="intro-text">' + intro.html + '</div></div>' +
      side.map(function (c) {
        return '<aside class="intro-side">' + (c.image ? '<img src="' + esc(c.image) + '" alt="' + esc(c.title) + '">' : '') +
          '<h2>' + esc(c.title) + '</h2><div class="intro-side-text">' + c.html + '</div></aside>';
      }).join('');
    box.classList.toggle('has-side', side.length > 0);
    // 回答が進んだら1行に縮める（compactIntro）。開くボタンで元に戻せる
    var bar = document.createElement('div'); bar.className = 'intro-bar';
    bar.innerHTML = '<span class="intro-bar-title">' + (intro.title ? inline(intro.title) : '') + '</span><button type="button" class="intro-toggle">説明を見る</button>';
    box.insertBefore(bar, box.firstChild);
    bar.querySelector('.intro-toggle').addEventListener('click', function () {
      var open = box.classList.toggle('is-open'); this.textContent = open ? '閉じる' : '説明を見る';
    });
    box.hidden = false;
  }

  /* ---------- セクションとの連動 ---------- */
  // セクションの数が設定され、どれかのカードにセクションが書かれているときだけ連動する
  function linked() {
    return state.sections > 0 && state.cards.some(function (c) { return c.sections.length; });
  }

  function sectionLabel(s) {
    if (s === DONE) return '回答ありがとうございました';
    return state.titles[s - 1] ? state.titles[s - 1] : 'セクション ' + s;
  }

  function renderBar() {
    var bar = document.getElementById('section-bar');
    if (!linked()) { bar.hidden = true; return; }
    var s = state.current;
    var pos = s === DONE ? '送信後' : s + ' / ' + state.sections;
    var now = '<div class="step-now"><span class="step-pos">' + esc(pos) + '</span>' +
      '<span class="step-title">' + esc(sectionLabel(s)) + '</span></div>';
    bar.innerHTML = !state.manual ? now :
      '<button type="button" class="step-btn" data-step="-1" aria-label="前のセクションの内容"' + (s === 1 ? ' disabled' : '') + '>‹</button>' + now +
      '<button type="button" class="step-btn" data-step="1" aria-label="次のセクションの内容"' + (s === DONE ? ' disabled' : '') + '>›</button>';
    bar.hidden = false;
  }

  function applyFilter(flash) {
    var useSection = linked();
    var shown = 0;
    document.querySelectorAll('#vision-cards .card').forEach(function (el) {
      var c = state.cards[Number(el.getAttribute('data-i'))];
      var okKind = state.kind === 'すべて' || c.kind === state.kind;
      // セクションの書かれていないカードは、いつでも表示する
      var okSec = !useSection || !c.sections.length || c.sections.indexOf(state.current) >= 0;
      el.hidden = !(okKind && okSec);
      if (!el.hidden) {
        shown++;
        if (flash) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
      }
    });
    var empty = document.getElementById('vision-empty');
    if (empty) empty.hidden = shown > 0;
    markQuestion(false);
  }

  /* ---------- 質問との連動（自前の回答画面） ---------- */
  // 今見ている質問に関係するカードに印を付け、右側の欄の中でそのカードまで動かす
  function markQuestion(scroll) {
    var info = document.getElementById('info');
    var target = null;
    document.querySelectorAll('#vision-cards .card').forEach(function (el) {
      var c = state.cards[Number(el.getAttribute('data-i'))];
      var on = !!state.question && !el.hidden && c.questions.indexOf(state.question) >= 0;
      el.classList.toggle('is-current', on);
      if (on && !target) target = el;
    });
    // 右側が画面に貼り付いている（PC）ときだけ動かす。スマホでは画面全体が動いてしまうため動かさない
    if (!scroll || !target || getComputedStyle(info).position !== 'sticky') return;
    var top = info.scrollTop + target.getBoundingClientRect().top - info.getBoundingClientRect().top - 64;
    info.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }

  function focusQuestion(no) {
    if (no === state.question) return;
    state.question = no || '';
    markQuestion(true);
  }

  function setSection(s, fromForm) {
    if (s !== DONE) s = Math.min(Math.max(1, s), state.sections || 1);
    var changed = s !== state.current;
    state.current = s;
    renderBar();
    applyFilter(changed);
    if (changed) {
      var info = document.getElementById('info');
      if (info.scrollTop) info.scrollTop = 0;
    }
    if (fromForm && changed) {
      // 新しいセクションの先頭が見えるよう、フォームの頭まで戻す
      var top = document.getElementById('form-holder').getBoundingClientRect().top;
      if (top < 0) window.scrollBy({ top: top - 16, behavior: 'smooth' });
    }
  }

  function step(dir) {
    var s = state.current;
    if (dir > 0) setSection(s === DONE ? DONE : (s >= state.sections ? DONE : s + 1));
    else setSection(s === DONE ? state.sections : s - 1);
  }

  // フォームが読み込まれるたびに呼ばれる（「次へ」「戻る」「送信」のどれでも読み込みが起きる）
  // 外側からは区別できないので「次へ」とみなして進め、ずれたら右側の ‹ › で直してもらう
  function formLoaded() {
    state.loads++;
    if (state.loads === 1 || !state.sections) return;
    var s = state.current;
    if (s === DONE) setSection(1, true);            // 「別の回答を送信」で最初に戻った
    else if (s >= state.sections) setSection(DONE, true);
    else setSection(s + 1, true);
  }

  function render(cards) {
    state.cards = cards;
    var box = document.getElementById('vision-cards');
    var filter = document.getElementById('vision-filter');
    if (!cards.length) {
      box.innerHTML = '<div class="notice"><p>まだ内容が登録されていません。</p></div>';
      return;
    }
    box.innerHTML = cards.map(function (c, i) {
      // 見出し・文章を先に、その下に動画・埋め込み・画像
      return '<article class="card' + (c.embed ? ' card-embed' : '') + '" data-i="' + i + '">' +
        '<div class="card-body"><div class="card-meta">' +
        (c.kind ? '<span class="tag ' + tagClass(c.kind) + '">' + esc(c.kind) + '</span>' : '') +
        (c.when ? '<span class="card-when">' + esc(c.when) + '</span>' : '') +
        '</div><h3>' + esc(c.title) + '</h3><div class="card-text">' + c.html + '</div></div>' +
        (c.video ? videoHtml(c) : '') +
        (c.embed ? embedHtml(c) : '') +
        (c.image && !c.embed && !c.video ? '<div class="card-img"><img src="' + esc(c.image) + '" alt="' + esc(c.title) + '" loading="' + (i < 3 ? 'eager' : 'lazy') + '"></div>' : '') +
        (c.embed ? '<div class="card-foot">' + embedLinks(c) + '</div>' : '') + '</article>';
    }).join('') + '<p id="vision-empty" class="notice" hidden>このセクションに関連する内容はありません。</p>';
    box.querySelectorAll('.card-embed-box iframe').forEach(fitToContent);

    // 区分ごとの絞り込みボタンは使わない（区分はカードの小さな札としてだけ表示）
    filter.hidden = true;

    document.getElementById('section-bar').addEventListener('click', function (ev) {
      var b = ev.target.closest('.step-btn');
      if (b && !b.disabled) step(Number(b.getAttribute('data-step')));
    });
    renderBar();
    applyFilter(false);
  }

  function load(file) {
    var baseDir = file.indexOf('/') >= 0 ? file.slice(0, file.lastIndexOf('/') + 1) : '';
    var box = document.getElementById('vision-cards');
    box.innerHTML = '<p class="lead">読み込んでいます…</p>';
    fetch(file + '?_=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); })
      .then(function (md) {
        var doc = parse(md, baseDir);
        var top = function (c) { return c.place.indexOf('上段') >= 0; };
        renderIntro(doc.intro, doc.cards.filter(top));
        render(doc.cards.filter(function (c) { return !top(c); }));
      })
      .catch(function () {
        box.innerHTML = '<div class="notice"><p><strong>内容ファイルを読み込めませんでした。</strong></p>' +
          '<p>パソコンで確認するときは、index.html を直接開くのではなく start.bat から開いてください。</p></div>';
      });
  }

  function compactIntro(on) {   // 上段の説明を1行にする（回答中は場所を取らない）
    var box = document.getElementById('intro');
    box.classList.toggle('is-compact', !!on);
    if (!on) box.classList.remove('is-open');
    var t = box.querySelector('.intro-toggle'); if (t) t.textContent = '説明を見る';
  }

  return { load: load, parse: parse, formLoaded: formLoaded, setSection: setSection, configure: configure, focusQuestion: focusQuestion, compactIntro: compactIntro };
})();
