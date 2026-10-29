/* 画面全体：合言葉、フォームの埋め込み、内容の読み込み */
(function () {
  'use strict';

  var CFG = window.SURVEY_CONFIG || {};
  var params = new URLSearchParams(location.search);
  // 「みんなの回答」を使うか（使わないときは合言葉を画面側だけで確かめる）
  var RESULTS = CFG.SHOW_RESULTS === true;
  var DEMO = RESULTS && (!CFG.API_URL || params.has('demo'));
  var MODE = !RESULTS ? 'static' : DEMO ? 'demo' : 'live';
  var STORE_KEY = 'lexxmoma-survey-pass';

  var $ = function (id) { return document.getElementById(id); };

  /* ---------- 合言葉の記憶（使えない環境でも動くように try で囲む） ---------- */
  function loadPass() {
    try {
      var v = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (v && v.until > Date.now() && v.mode === MODE) return v.pw;
    } catch (e) { /* 何もしない */ }
    return null;
  }
  function savePass(pw) {
    var hours = Number(CFG.REMEMBER_HOURS) || 0;
    if (hours <= 0) return;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ pw: pw, mode: MODE, until: Date.now() + hours * 3600e3 }));
    } catch (e) { /* 何もしない */ }
  }
  function clearPass() {
    try { localStorage.removeItem(STORE_KEY); } catch (e) { /* 何もしない */ }
  }

  function sha256(text) {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    });
  }

  /* 合言葉を確かめる。
   * 「みんなの回答」なし：config.js の PASSWORD_HASH と照合（画面に入るための簡易な鍵）
   * 「みんなの回答」あり：Apps Script に問い合わせ、結果データもそのまま受け取る */
  function verify(pw) {
    if (MODE === 'static') {
      return sha256(pw).then(function (h) {
        if (h !== String(CFG.PASSWORD_HASH || '').toLowerCase()) throw { code: 'auth' };
        return null;
      });
    }
    if (DEMO) {
      return pw === String(CFG.DEMO_PASSWORD || 'demo')
        ? Promise.resolve(null)
        : Promise.reject({ code: 'auth' });
    }
    return Results.fetchData(pw);
  }

  function enter(pw, data) {
    $('gate').hidden = true;
    $('app').hidden = false;
    $('demo-badge').hidden = !DEMO;
    embedForm();
    Content.load(CFG.CONTENT_FILE || 'content/items.md');
    if (RESULTS) startResults(pw, data);
  }

  function gateMessage(err) {
    if (err && err.code === 'auth') return '合言葉が違います。';
    if (MODE === 'static') return '合言葉を確認できませんでした。https:// のページ（またはパソコンでは start.bat）から開いてください。';
    if (err && err.code === 'nopassword') return '回答データ側で合言葉がまだ設定されていません（管理者の方は README.md の付録 A-3 をご確認ください）。';
    return '回答データに接続できませんでした。時間をおいてもう一度お試しください。';
  }

  function initGate() {
    var form = $('gate-form');
    var input = $('gate-input');
    var msg = $('gate-msg');
    var btn = form.querySelector('button');

    // 合言葉を設定していなければ、入口を出さずにそのまま入る
    if (MODE === 'static' && !CFG.PASSWORD_HASH) { enter('', null); return; }

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var pw = input.value.trim();
      if (!pw) return;
      btn.disabled = true;
      msg.style.color = 'var(--sub)';
      msg.textContent = '確認しています…';
      verify(pw).then(function (data) {
        savePass(pw);
        msg.textContent = '';
        enter(pw, data);
      }).catch(function (err) {
        msg.style.color = '';
        msg.textContent = gateMessage(err);
        input.select();
      }).then(function () { btn.disabled = false; });
    });

    if (DEMO) {
      var hint = document.createElement('p');
      hint.className = 'gate-note';
      hint.style.margin = '16px 0 0';
      hint.textContent = '確認用モード（ダミーデータ）です。合言葉：' + (CFG.DEMO_PASSWORD || 'demo');
      form.appendChild(hint);
    }

    var saved = loadPass();
    if (saved) {
      verify(saved).then(function (data) { enter(saved, data); })
        .catch(function (err) {
          if (err && err.code === 'auth') clearPass();
          msg.textContent = gateMessage(err);
          input.focus();
        });
    } else {
      input.focus();
    }
  }

  /* ---------- 「みんなの回答」（使うときだけグラフの部品を読み込む） ---------- */
  function startResults(pw, data) {
    $('results-area').hidden = false;
    var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';
    s.onload = function () {
      Results.setup({ password: pw, demo: DEMO, initialData: data });
      Results.setActive(true);
    };
    document.head.appendChild(s);
  }

  /* ---------- フォームの埋め込み ---------- */
  // 回答用URL・埋め込み用URL・<iframe …> のコードのどれを貼っても使えるようにする
  function formEmbedUrl(raw) {
    raw = String(raw || '').trim();
    if (!raw) return '';
    var m = raw.match(/src="([^"]+)"/);
    if (m) raw = m[1];
    if (raw.indexOf('docs.google.com/forms') >= 0 && raw.indexOf('embedded=true') < 0) {
      raw += (raw.indexOf('?') >= 0 ? '&' : '?') + 'embedded=true';
    }
    return raw;
  }

  function embedForm() {
    var holder = $('form-holder');
    var url = formEmbedUrl(CFG.FORM_URL);
    if (!url) {
      holder.innerHTML = '<div class="notice"><p><strong>フォームはまだ設定されていません。</strong></p>' +
        '<p>js/config.js の FORM_URL に Google フォームのURLを入れると、ここに表示されます。</p></div>';
      return;
    }
    // 枠の中が空白のときでも気づけるよう、案内はフォームの上に置く
    var p = document.createElement('p');
    p.className = 'lead';
    var a = document.createElement('a');
    a.href = url.replace(/([?&])embedded=true&?/, '$1').replace(/[?&]$/, '');
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = 'フォームが表示されない場合は、こちらから回答できます ↗';
    p.appendChild(a);
    holder.appendChild(p);
    var f = document.createElement('iframe');
    f.src = url;
    f.title = 'アンケート回答フォーム';
    f.loading = 'lazy';
    f.textContent = '読み込んでいます…';
    f.addEventListener('load', Content.formLoaded);
    var h = Number(CFG.FORM_HEIGHT) || 1400;
    f.style.height = Math.round(window.innerWidth < 640 ? h * 1.2 : h) + 'px';
    holder.appendChild(f);
  }

  initGate();
})();
