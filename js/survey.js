/* 自前の回答画面：js/questions.js の質問をページごとに表示し、回答は Google フォームへ送る */
var Survey = (function () {
  'use strict';

  var DRAFT_KEY = 'lexxmoma-survey-draft';
  var form, holder, hooks;
  var state = { page: 0, history: [0], answers: {}, email: '', active: '' };

  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  function questions(pageIndex) {
    return form.pages[pageIndex].items.filter(function (i) { return i.kind === 'question'; });
  }
  function allQuestions() {
    return form.pages.reduce(function (a, p, i) { return a.concat(questions(i)); }, []);
  }

  /* ---------- 下書きの保存（この端末のブラウザの中だけ） ---------- */
  function saveDraft() {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ title: form.title, answers: state.answers, email: state.email, history: state.history }));
    } catch (e) { /* 保存できなくても回答はできる */ }
  }
  function loadDraft() {
    try {
      var d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
      if (!d || d.title !== form.title) return;
      state.answers = d.answers || {};
      state.email = d.email || '';
      var h = (d.history || [0]).filter(function (i) { return i >= 0 && i < form.pages.length; });
      if (h.length && h[0] === 0) { state.history = h; state.page = h[h.length - 1]; }
    } catch (e) { /* 読めなければ最初から */ }
  }
  function clearDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* 何もしない */ }
  }

  /* ---------- 進み先（分岐） ---------- */
  // ページ内で最後に答えた分岐つきの選択が行き先を決める（Google フォームと同じ）。なければ次のページ
  function nextTarget(pageIndex) {
    var target = pageIndex + 1;
    questions(pageIndex).forEach(function (q) {
      if ((q.type !== 'radio' && q.type !== 'dropdown') || !q.choices) return;
      var v = state.answers[q.id];
      var c = q.choices.filter(function (x) { return x.value === v; })[0];
      if (c && c.goto != null) target = c.goto;
    });
    return target === 'submit' || target >= form.pages.length ? 'submit' : target;
  }

  /* ---------- 1問分の表示 ---------- */
  function optionRow(q, type, value, checked, extraClass) {
    return '<label class="sv-opt' + (extraClass || '') + '"><input type="' + type + '" name="' + esc(q.id) + '" value="' + esc(value) + '"' +
      (checked ? ' checked' : '') + '><span>' + esc(value) + '</span></label>';
  }

  // フォーム側で選択肢が消えているときは、答えずに進めるようにする
  function noChoices() {
    return '<p class="sv-help">この質問は準備中のため、回答は不要です。</p>';
  }

  function questionHtml(q) {
    var v = state.answers[q.id];
    var h = '<section class="sv-q" data-qid="' + esc(q.id) + '" data-no="' + esc(q.no || '') + '" tabindex="-1">' +
      '<h4 class="sv-title">' + esc(q.title) + (q.required ? '<span class="sv-req">必須</span>' : '<span class="sv-opt-tag">任意</span>') + '</h4>' +
      (q.help ? '<p class="sv-help">' + esc(q.help) + '</p>' : '');
    switch (q.type) {
      case 'text':
        h += '<input class="sv-input" type="text" name="' + esc(q.id) + '" value="' + esc(v || '') + '" autocomplete="off">';
        break;
      case 'paragraph':
        h += '<textarea class="sv-input" name="' + esc(q.id) + '" rows="4">' + esc(v || '') + '</textarea>';
        break;
      case 'radio':
        if (!q.choices.length) { h += noChoices(); break; }
        h += '<div class="sv-opts">' + q.choices.map(function (c) { return optionRow(q, 'radio', c.value, v === c.value); }).join('') + '</div>';
        break;
      case 'dropdown':
        h += '<select class="sv-input" name="' + esc(q.id) + '"><option value="">選んでください</option>' +
          q.choices.map(function (c) { return '<option' + (v === c.value ? ' selected' : '') + '>' + esc(c.value) + '</option>'; }).join('') + '</select>';
        break;
      case 'checkbox':
        if (!q.choices.length) { h += noChoices(); break; }
        var vs = v || [], ex = q.exclusive || [];
        h += '<div class="sv-opts">' + q.choices.map(function (c, i) {
          var isEx = ex.indexOf(c.value) >= 0;
          var first = isEx && (i === 0 || ex.indexOf(q.choices[i - 1].value) < 0);
          return optionRow(q, 'checkbox', c.value, vs.indexOf(c.value) >= 0, (isEx ? ' sv-ex' : '') + (first ? ' sv-ex-first' : ''));
        }).join('') + '</div>';
        if (q.maxSelect) h += '<p class="sv-count"></p>';
        break;
      case 'scale':
      case 'rating':
        h += '<div class="sv-scale">' + (q.minLabel ? '<span class="sv-scale-label">' + esc(q.minLabel) + '</span>' : '');
        for (var n = q.min; n <= q.max; n++) h += optionRow(q, 'radio', String(n), String(v) === String(n), ' sv-scale-opt');
        h += (q.maxLabel ? '<span class="sv-scale-label">' + esc(q.maxLabel) + '</span>' : '') + '</div>';
        break;
      case 'date':
      case 'time':
        h += '<input class="sv-input sv-short" type="' + q.type + '" name="' + esc(q.id) + '" value="' + esc(v || '') + '">';
        break;
      default:
        h += '<p class="sv-help">この形式の質問は、Google フォームからお答えください。</p>';
    }
    return h + '<p class="sv-err" role="alert" hidden></p></section>';
  }

  /* ---------- ページの表示 ---------- */
  function render(focusTop) {
    var p = form.pages[state.page];
    var total = form.pages.length;
    var target = nextTarget(state.page);
    var h = '<div class="sv">' +
      '<div class="sv-progress" aria-label="進み具合"><div class="sv-bar"><i style="width:' + Math.round((state.page + 1) / total * 100) + '%"></i></div>' +
      '<span>ページ ' + (state.page + 1) + ' / ' + total + '</span></div>' +
      '<h3 class="sv-page-title">' + esc(p.title || form.title) + '</h3>' +
      (p.description ? '<p class="sv-page-desc">' + esc(p.description) + '</p>' : '');
    if (state.page === 0 && form.description) {
      h += '<details class="sv-about"' + (state.history.length === 1 ? ' open' : '') + '><summary>このアンケートについて</summary><p>' + esc(form.description) + '</p></details>';
    }
    if (state.page === 0 && form.collectEmail) {
      h += '<section class="sv-q" data-qid="__email" data-no="" tabindex="-1"><h4 class="sv-title">メールアドレス<span class="sv-req">必須</span></h4>' +
        '<input class="sv-input" type="email" name="__email" value="' + esc(state.email) + '" autocomplete="email" inputmode="email">' +
        '<p class="sv-err" role="alert" hidden></p></section>';
    }
    p.items.forEach(function (it) {
      h += it.kind === 'header'
        ? '<div class="sv-header"><h4>' + esc(it.title) + '</h4>' + (it.description ? '<p>' + esc(it.description) + '</p>' : '') + '</div>'
        : questionHtml(it);
    });
    h += '<div class="sv-nav">' +
      (state.history.length > 1 ? '<button type="button" class="btn btn-ghost" data-act="back">戻る</button>' : '<span></span>') +
      '<button type="button" class="btn btn-primary" data-act="next">' + (target === 'submit' ? '送信する' : '次へ') + '</button></div>' +
      '<p class="sv-foot">' + (form.ready && form.formUrl
        ? 'うまく送信できない場合は、<a href="' + esc(form.formUrl) + '" target="_blank" rel="noopener">Google フォーム</a>からも回答できます。'
        : '確認用の表示です。フォームの公開後に、実際に送信できるようになります。') + '</p></div>';
    holder.innerHTML = h;
    holder.querySelectorAll('.sv-q').forEach(updateCount);
    hooks.onPage && hooks.onPage(state.page);
    var first = holder.querySelector('.sv-q');
    setActive(first ? first.getAttribute('data-no') : '');
    if (focusTop) {
      var top = holder.getBoundingClientRect().top;
      if (top < 0) window.scrollBy({ top: top - 16, behavior: 'smooth' });
    }
  }

  /* ---------- 入力の受け取り ---------- */
  // 画面の部品の名前は文字なので、番号の質問IDとも文字どうしで比べる
  function qById(id) { return allQuestions().filter(function (q) { return String(q.id) === String(id); })[0]; }

  function updateCount(sec) {
    var q = qById(sec.getAttribute('data-qid'));
    if (!q || q.type !== 'checkbox') return;
    var vs = state.answers[q.id] || [], ex = q.exclusive || [];
    var normal = vs.filter(function (v) { return ex.indexOf(v) < 0; }).length;
    var full = q.maxSelect && normal >= q.maxSelect;
    sec.querySelectorAll('.sv-opt').forEach(function (lab) {
      var input = lab.querySelector('input');
      var off = full && !input.checked && ex.indexOf(input.value) < 0;
      input.disabled = off;
      lab.classList.toggle('is-off', off);
    });
    var cnt = sec.querySelector('.sv-count');
    if (cnt) cnt.textContent = vs.length + ' 個選択中（' + (q.minSelect || 1) + '〜' + q.maxSelect + 'つ）' + (full ? '　上限に達しました' : '');
  }

  function onInput(ev) {
    var t = ev.target;
    if (!t.name) return;
    if (t.name === '__email') { state.email = t.value.trim(); saveDraft(); return; }
    var q = qById(t.name);
    if (!q) return;
    if (q.type === 'checkbox') {
      var ex = q.exclusive || [];
      var vs = (state.answers[q.id] || []).slice();
      if (t.checked) {
        // 「単独で選択」の選択肢と、ほかの選択肢は同時に選べない
        vs = ex.indexOf(t.value) >= 0 ? [t.value] : vs.filter(function (v) { return ex.indexOf(v) < 0; }).concat(t.value);
      } else {
        vs = vs.filter(function (v) { return v !== t.value; });
      }
      state.answers[q.id] = q.choices.map(function (c) { return c.value; }).filter(function (v) { return vs.indexOf(v) >= 0; });
      var sec = t.closest('.sv-q');
      sec.querySelectorAll('input[type=checkbox]').forEach(function (i) { i.checked = state.answers[q.id].indexOf(i.value) >= 0; });
      updateCount(sec);
    } else {
      state.answers[q.id] = t.value;
    }
    clearError(t.closest('.sv-q'));
    saveDraft();
    hooks.onAnswer && hooks.onAnswer(q.no, state.answers[q.id]);   // 右側の表示に知らせる（Q4-1 の工場の早見表など）
    // 分岐で行き先が変わったら、ボタンの文字（次へ／送信する）も合わせる
    var btn = holder.querySelector('[data-act=next]');
    if (btn) btn.textContent = nextTarget(state.page) === 'submit' ? '送信する' : '次へ';
  }

  /* ---------- 入力の確認 ---------- */
  function showError(sec, msg) {
    var e = sec.querySelector('.sv-err');
    e.textContent = msg;
    e.hidden = false;
    sec.classList.add('has-err');
  }
  function clearError(sec) {
    if (!sec) return;
    sec.querySelector('.sv-err').hidden = true;
    sec.classList.remove('has-err');
  }

  function validatePage() {
    var bad = [];
    holder.querySelectorAll('.sv-q').forEach(function (sec) {
      clearError(sec);
      var id = sec.getAttribute('data-qid');
      if (id === '__email') {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.email)) { showError(sec, 'メールアドレスを正しく入力してください。'); bad.push(sec); }
        return;
      }
      var q = qById(id), v = state.answers[id];
      if (q.choices && !q.choices.length) return;
      var empty = v == null || (Array.isArray(v) ? !v.length : !String(v).trim());
      if (q.required && empty) { showError(sec, 'この質問は必須です。'); bad.push(sec); return; }
      if (q.type === 'checkbox' && v && v.length && q.maxSelect) {
        var ex = q.exclusive || [];
        if (!(v.length === 1 && ex.indexOf(v[0]) >= 0) && (v.length < (q.minSelect || 1) || v.length > q.maxSelect)) {
          showError(sec, (q.minSelect || 1) + '〜' + q.maxSelect + 'つ選んでください。');
          bad.push(sec);
        }
      }
    });
    if (bad.length) {
      bad[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
      bad[0].focus({ preventScroll: true });
      return false;
    }
    return true;
  }

  /* ---------- 送信 ---------- */
  function payload() {
    var params = new URLSearchParams();
    var shown = [];
    if (form.collectEmail) { params.append('emailAddress', state.email); shown.push(['メールアドレス', state.email]); }
    state.history.forEach(function (pi) {
      questions(pi).forEach(function (q) {
        var v = state.answers[q.id];
        if (v == null || v === '' || (Array.isArray(v) && !v.length)) return;
        (Array.isArray(v) ? v : [v]).forEach(function (one) { params.append('entry.' + q.entry, one); });
        shown.push([q.title, Array.isArray(v) ? v.join(' ／ ') : v]);
      });
    });
    params.append('pageHistory', state.history.join(','));
    params.append('fvv', '1');
    return { params: params, shown: shown };
  }

  function finish(preview) {
    clearDraft();
    var conf = (window.SURVEY_CONFIG || {}).CONFIRMATION ||
      'ご回答ありがとうございました。いただいたご意見を、適用工程の検討と開発・提案の優先順位付けに活用いたします。';
    var h = '<div class="sv sv-done"><div class="sv-done-mark">✓</div><h3 class="sv-page-title">' + (preview ? '送信内容の確認（確認用）' : 'ご回答ありがとうございました') + '</h3>' +
      '<p>' + esc(preview ? 'フォームが公開前のため、実際には送信していません。公開後は、この内容が Google フォームに送信されます。' : conf) + '</p>';
    if (preview) {
      h += '<table class="sv-preview">' + preview.map(function (r) { return '<tr><th>' + esc(r[0]) + '</th><td>' + esc(r[1]) + '</td></tr>'; }).join('') + '</table>';
    }
    h += '<div class="sv-nav"><span></span><button type="button" class="btn btn-ghost" data-act="restart">最初の画面に戻る</button></div></div>';
    holder.innerHTML = h;
    hooks.onPage && hooks.onPage('done');
    var top = holder.getBoundingClientRect().top;
    if (top < 0) window.scrollBy({ top: top - 16, behavior: 'smooth' });
  }

  function submit(btn) {
    var p = payload();
    if (!form.ready) { finish(p.shown); return; }
    // フォーム側に送信を妨げる設定がある間は、送ったふりをせず Google フォームへ案内する
    if (form.problems && form.problems.length) {
      holder.querySelector('.sv-foot').innerHTML = '<strong class="sv-fail">ただいまフォームを調整中のため、この画面からは送信できません。</strong>' +
        'お手数ですが、<a href="' + esc(form.formUrl) + '" target="_blank" rel="noopener">Google フォーム</a>からご回答ください。';
      return;
    }
    btn.disabled = true;
    btn.textContent = '送信しています…';
    var url = form.formUrl.replace(/\/viewform.*$/, '/formResponse');
    // Google フォームは送信結果を外のページに返さないため、通信が終わったことをもって完了とする
    fetch(url, { method: 'POST', mode: 'no-cors', body: p.params })
      .then(function () { finish(null); })
      .catch(function () {
        btn.disabled = false;
        btn.textContent = '送信する';
        var sec = holder.querySelector('.sv-foot');
        sec.innerHTML = '<strong class="sv-fail">送信できませんでした。</strong>通信状態を確認して、もう一度「送信する」を押してください。' +
          '続けて失敗する場合は <a href="' + esc(form.formUrl) + '" target="_blank" rel="noopener">Google フォーム</a>から回答できます（入力内容は引き継がれません）。';
      });
  }

  function onClick(ev) {
    var b = ev.target.closest('[data-act]');
    if (!b) return;
    var act = b.getAttribute('data-act');
    if (act === 'back') {
      state.history.pop();
      state.page = state.history[state.history.length - 1];
      saveDraft();
      render(true);
    } else if (act === 'next') {
      if (!validatePage()) return;
      var t = nextTarget(state.page);
      if (t === 'submit') { submit(b); return; }
      state.history.push(t);
      state.page = t;
      saveDraft();
      render(true);
    } else if (act === 'restart') {
      state = { page: 0, history: [0], answers: {}, email: '', active: '' };
      render(true);
    }
  }

  /* ---------- 今見ている質問（右側の連動に使う） ---------- */
  function setActive(no) {
    if (no === state.active) return;
    state.active = no;
    holder.querySelectorAll('.sv-q').forEach(function (s) { s.classList.toggle('is-active', !!no && s.getAttribute('data-no') === no); });
    hooks.onQuestion && hooks.onQuestion(no);
  }
  function fromEvent(ev) {
    var sec = ev.target.closest && ev.target.closest('.sv-q');
    if (sec) setActive(sec.getAttribute('data-no'));
  }
  // 画面を動かしたときは、画面の上から4割の位置にある質問を「今見ている質問」とする
  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      var line = window.innerHeight * 0.4, pick = null;
      holder.querySelectorAll('.sv-q').forEach(function (s) {
        if (s.getBoundingClientRect().top <= line) pick = s;
      });
      if (!pick) pick = holder.querySelector('.sv-q');
      if (pick && document.activeElement && pick.contains(document.activeElement) === false &&
          holder.contains(document.activeElement) && document.activeElement.closest('.sv-q')) return; // 入力中の質問を優先
      if (pick) setActive(pick.getAttribute('data-no'));
    });
  }

  function start(opts) {
    form = opts.form;
    holder = opts.holder;
    hooks = opts;
    loadDraft();
    holder.addEventListener('input', onInput);
    holder.addEventListener('change', onInput);
    holder.addEventListener('click', onClick);
    holder.addEventListener('focusin', fromEvent);
    holder.addEventListener('pointerdown', fromEvent);
    window.addEventListener('scroll', onScroll, { passive: true });
    render(false);
  }

  function answerOf(no) {               // 質問番号（Q4-1 など）で今の回答を返す
    var q = allQuestions().filter(function (x) { return x.no === no; })[0];
    return q ? state.answers[q.id] : undefined;
  }

  return { start: start, payload: function () { return payload(); }, state: function () { return state; }, answerOf: answerOf };
})();
