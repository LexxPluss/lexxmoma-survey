/* content/items.md を読み込み、上段の「一般情報」と右側のカードを作る
 * 右側のカードは、フォームのセクションの進み具合に合わせて切り替える
 * 書き方は content/items.md の先頭の説明を参照 */
var Content = (function () {
  'use strict';

  var CFG = window.SURVEY_CONFIG || {};
  var KEYS = { '区分': 'kind', '時期': 'when', '画像': 'image', 'セクション': 'section' };
  var DONE = 'done'; // 送信後

  var state = {
    cards: [],
    kind: 'すべて',
    sections: Math.max(0, Number(CFG.FORM_SECTIONS) || 0),
    current: 1,
    loads: 0
  };

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
      var card = { title: lines.shift().trim(), kind: '', when: '', image: '', section: '', body: [] };
      var inHead = true;
      lines.forEach(function (line) {
        var m = line.match(/^([^:：]{1,5})[:：]\s*(.*)$/);
        if (inHead && m && KEYS[m[1].trim()]) { card[KEYS[m[1].trim()]] = m[2].trim(); return; }
        var img = line.match(/^!\[[^\]]*\]\(([^)]+)\)\s*$/);
        if (img && !card.image) { card.image = img[1].trim(); return; }
        if (line.trim()) inHead = false;
        card.body.push(line);
      });
      if (card.image && !/^(https?:)?\/\//.test(card.image) && card.image.charAt(0) !== '/') {
        card.image = baseDir + card.image;
      }
      card.sections = parseSections(card.section);
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
    if (kind.indexOf('構想') >= 0) return 'tag-vision';
    if (kind.indexOf('事例') >= 0) return 'tag-case';
    return 'tag-other';
  }

  function renderIntro(intro) {
    var box = document.getElementById('intro');
    if (!intro.title && !intro.html) { box.hidden = true; return; }
    box.innerHTML = (intro.title ? '<h1>' + inline(intro.title) + '</h1>' : '') +
      '<div class="intro-text">' + intro.html + '</div>';
    box.hidden = false;
  }

  /* ---------- セクションとの連動 ---------- */
  // セクションの数が設定され、どれかのカードにセクションが書かれているときだけ連動する
  function linked() {
    return state.sections > 0 && state.cards.some(function (c) { return c.sections.length; });
  }

  function sectionLabel(s) {
    if (s === DONE) return '回答ありがとうございました';
    var titles = CFG.SECTION_TITLES || [];
    return titles[s - 1] ? titles[s - 1] : 'セクション ' + s;
  }

  function renderBar() {
    var bar = document.getElementById('section-bar');
    if (!linked()) { bar.hidden = true; return; }
    var s = state.current;
    var pos = s === DONE ? '送信後' : s + ' / ' + state.sections;
    bar.innerHTML =
      '<button type="button" class="step-btn" data-step="-1" aria-label="前のセクションの内容"' + (s === 1 ? ' disabled' : '') + '>‹</button>' +
      '<div class="step-now"><span class="step-pos">' + esc(pos) + '</span>' +
      '<span class="step-title">' + esc(sectionLabel(s)) + '</span></div>' +
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
      return '<article class="card" data-i="' + i + '">' +
        (c.image ? '<div class="card-img"><img src="' + esc(c.image) + '" alt="" loading="' + (i < 3 ? 'eager' : 'lazy') + '"></div>' : '') +
        '<div class="card-body"><div class="card-meta">' +
        (c.kind ? '<span class="tag ' + tagClass(c.kind) + '">' + esc(c.kind) + '</span>' : '') +
        (c.when ? '<span class="card-when">' + esc(c.when) + '</span>' : '') +
        '</div><h3>' + esc(c.title) + '</h3><div class="card-text">' + c.html + '</div></div></article>';
    }).join('') + '<p id="vision-empty" class="notice" hidden>このセクションに関連する内容はありません。</p>';

    var kinds = [];
    cards.forEach(function (c) { if (c.kind && kinds.indexOf(c.kind) < 0) kinds.push(c.kind); });
    if (kinds.length >= 2) {
      filter.innerHTML = ['すべて'].concat(kinds).map(function (k, i) {
        return '<button type="button" class="chip" aria-pressed="' + (i === 0) + '" data-kind="' + esc(k) + '">' + esc(k) + '</button>';
      }).join('');
      filter.addEventListener('click', function (ev) {
        var b = ev.target.closest('.chip');
        if (!b) return;
        state.kind = b.getAttribute('data-kind');
        filter.querySelectorAll('.chip').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
        applyFilter(false);
      });
    } else {
      filter.hidden = true;
    }

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
        renderIntro(doc.intro);
        render(doc.cards);
      })
      .catch(function () {
        box.innerHTML = '<div class="notice"><p><strong>内容ファイルを読み込めませんでした。</strong></p>' +
          '<p>パソコンで確認するときは、index.html を直接開くのではなく start.bat から開いてください。</p></div>';
      });
  }

  return { load: load, parse: parse, formLoaded: formLoaded, setSection: setSection };
})();
