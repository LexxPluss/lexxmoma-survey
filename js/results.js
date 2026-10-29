/* 「みんなの回答」：データ取得・集計・グラフ・検索 */
var Results = (function () {
  'use strict';

  var CFG = window.SURVEY_CONFIG || {};
  var state = {
    password: null,
    demo: false,
    data: null,
    signature: '',
    active: false,
    timer: null,
    lastFetch: 0,
    loading: false,
    charts: {},
    search: {},   // 質問ごとの検索語
    shown: {}     // 質問ごとの表示件数（記述式）
  };
  var PAGE = 30;
  var COLORS = ['#0068B7', '#3EB370', '#7FB3DC', '#9AD6B1', '#00508C', '#2A8C55', '#BFD7EC', '#CBEBD8'];
  var KIND_LABEL = {
    MULTIPLE_CHOICE: '選択式', LIST: '選択式（一覧）', CHECKBOX: '複数選択',
    SCALE: '均等目盛', RATING: '評価', TEXT: '記述式（短文）', PARAGRAPH_TEXT: '記述式（長文）',
    GRID: '選択式（表）', CHECKBOX_GRID: '複数選択（表）',
    DATE: '日付', TIME: '時刻', DATETIME: '日時', DURATION: '時間'
  };

  var $ = function (id) { return document.getElementById(id); };

  /* ================= データ取得 ================= */
  function fetchData(pw) {
    if (state.demo) return Promise.resolve(DemoData.snapshot(true));
    var url = CFG.API_URL + (CFG.API_URL.indexOf('?') >= 0 ? '&' : '?') +
      'pw=' + encodeURIComponent(pw) + '&_=' + Date.now();
    return fetch(url, { cache: 'no-store', redirect: 'follow' })
      .catch(function () { throw { code: 'network' }; })
      .then(function (res) {
        return res.json().catch(function () { throw { code: 'format' }; });
      })
      .then(function (json) {
        if (!json || !json.ok) throw { code: (json && json.error) || 'server', message: json && json.message };
        return json;
      });
  }

  /* ================= 集計 ================= */
  function toHalf(s) {
    return String(s).replace(/[０-９．－]/g, function (c) {
      return String.fromCharCode(c.charCodeAt(0) - 0xFEE0);
    }).replace(/[,，\s]/g, '');
  }
  function asNumber(v) {
    if (typeof v === 'number') return v;
    var s = toHalf(v);
    return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : null;
  }
  function isEmpty(v) {
    return v === null || v === undefined || v === '' ||
      (Array.isArray(v) && v.length === 0) ||
      (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0);
  }
  function median(arr) {
    var a = arr.slice().sort(function (x, y) { return x - y; });
    var m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }
  function round(n, d) { var p = Math.pow(10, d || 1); return Math.round(n * p) / p; }
  function pct(c, n) { return n ? round(c / n * 100, 1) : 0; }

  // 質問1つ分の集計。画面表示と CSV の両方でこの結果を使う
  function aggregate(q, responses) {
    var vals = [];
    responses.forEach(function (r) {
      var v = r.a ? r.a[q.id] : undefined;
      if (!isEmpty(v)) vals.push({ t: r.t, v: v });
    });
    var n = vals.length;
    var type = q.type;

    if (type === 'MULTIPLE_CHOICE' || type === 'LIST' || type === 'CHECKBOX') {
      var multi = type === 'CHECKBOX';
      var choices = (q.choices || []).slice();
      var counts = {};
      var others = [];
      choices.forEach(function (c) { counts[c] = 0; });
      vals.forEach(function (x) {
        var list = Array.isArray(x.v) ? x.v : [x.v];
        var hadOther = false;
        list.forEach(function (one) {
          one = String(one);
          if (Object.prototype.hasOwnProperty.call(counts, one) && choices.indexOf(one) >= 0) counts[one]++;
          else { hadOther = true; others.push(one); }
        });
        if (hadOther) counts['その他'] = (counts['その他'] || 0) + 1;
      });
      if (counts['その他'] !== undefined && choices.indexOf('その他') < 0) choices.push('その他');
      return {
        kind: multi ? 'multi' : 'choice', n: n, others: others,
        items: choices.map(function (c) { return { label: c, count: counts[c] || 0, pct: pct(counts[c] || 0, n) }; })
      };
    }

    if (type === 'SCALE' || type === 'RATING') {
      var lo = Number(q.min != null ? q.min : 1), hi = Number(q.max != null ? q.max : 5);
      var nums = vals.map(function (x) { return asNumber(x.v); }).filter(function (v) { return v !== null; });
      var items = [];
      for (var i = lo; i <= hi; i++) {
        var c = nums.filter(function (v) { return v === i; }).length;
        items.push({ label: String(i), count: c, pct: pct(c, nums.length) });
      }
      var sum = nums.reduce(function (a, b) { return a + b; }, 0);
      return { kind: 'scale', n: nums.length, items: items, avg: nums.length ? round(sum / nums.length, 2) : null, min: lo, max: hi };
    }

    if (type === 'GRID' || type === 'CHECKBOX_GRID') {
      var cols = (q.columns || []).slice();
      var rows = (q.rows || []).map(function (row) {
        var cc = {};
        cols.forEach(function (c) { cc[c] = 0; });
        var answered = 0;
        vals.forEach(function (x) {
          var cell = x.v[row];
          if (isEmpty(cell)) return;
          answered++;
          (Array.isArray(cell) ? cell : [cell]).forEach(function (c) { if (cc[c] !== undefined) cc[c]++; });
        });
        return { label: row, counts: cc, n: answered };
      });
      return { kind: 'grid', n: n, columns: cols, rows: rows };
    }

    // 記述式：回答がすべて数値なら数値として集計（q.numeric で強制・無効化もできる）
    var texts = vals.map(function (x) {
      return { t: x.t, v: Array.isArray(x.v) ? x.v.join(', ') : String(x.v) };
    });
    var asNums = texts.map(function (x) { return asNumber(x.v); });
    var allNum = n > 0 && asNums.every(function (v) { return v !== null; });
    if ((type === 'TEXT' && q.numeric !== false && allNum) || (q.numeric === true && n > 0)) {
      var ns = asNums.filter(function (v) { return v !== null; });
      if (ns.length) {
        return {
          kind: 'number', n: ns.length,
          avg: round(ns.reduce(function (a, b) { return a + b; }, 0) / ns.length, 2),
          median: round(median(ns), 2),
          min: Math.min.apply(null, ns), max: Math.max.apply(null, ns)
        };
      }
    }
    texts.sort(function (a, b) { return String(b.t).localeCompare(String(a.t)); });
    return { kind: 'text', n: n, list: texts };
  }

  /* ================= 表示 ================= */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtTime(t) {
    if (!t) return '–';
    var d = new Date(t);
    if (isNaN(d)) return String(t);
    var p = function (x) { return ('0' + x).slice(-2); };
    return d.getFullYear() + '/' + p(d.getMonth() + 1) + '/' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  // 長い選択肢は複数行に折り返す
  function wrapLabel(s, w) {
    s = String(s);
    if (s.length <= w) return s;
    var out = [];
    for (var i = 0; i < s.length; i += w) out.push(s.slice(i, i + w));
    return out;
  }

  // 棒の先に「n件（x%）」を描く
  var valueLabels = {
    id: 'valueLabels',
    afterDatasetsDraw: function (chart, args, opts) {
      if (!opts || !opts.texts) return;
      var ctx = chart.ctx;
      var horizontal = chart.options.indexAxis === 'y';
      ctx.save();
      ctx.font = '12px sans-serif';
      ctx.fillStyle = '#36424d';
      chart.getDatasetMeta(0).data.forEach(function (bar, i) {
        var text = opts.texts[i];
        if (!text) return;
        if (horizontal) {
          ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
          ctx.fillText(text.join(''), bar.x + 6, bar.y);
        } else {
          // 縦の棒は幅が狭いので「件数」と「割合」を2行に分ける
          ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
          ctx.fillText(text[0], bar.x, bar.y - 18);
          ctx.fillText(text[1], bar.x, bar.y - 4);
        }
      });
      ctx.restore();
    }
  };

  function barChart(canvas, agg, horizontal, color) {
    var narrow = window.innerWidth < 640;
    var labels = agg.items.map(function (it) {
      return wrapLabel(it.label, horizontal ? (narrow ? 8 : 18) : (narrow ? 5 : 8));
    });
    var maxCount = Math.max.apply(null, agg.items.map(function (it) { return it.count; }).concat([1]));
    return new Chart(canvas, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          data: agg.items.map(function (it) { return it.count; }),
          backgroundColor: color, borderRadius: 4, maxBarThickness: horizontal ? 26 : 56
        }]
      },
      options: {
        indexAxis: horizontal ? 'y' : 'x',
        responsive: true, maintainAspectRatio: false, animation: { duration: 300 },
        layout: { padding: horizontal ? { right: 90 } : { top: 36 } },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: function (c) { var it = agg.items[c.dataIndex]; return it.count + '件（' + it.pct + '%）'; } } },
          valueLabels: { texts: agg.items.map(function (it) { return [it.count + '件', '（' + it.pct + '%）']; }) }
        },
        scales: {
          x: horizontal ? { beginAtZero: true, suggestedMax: maxCount, ticks: { precision: 0 }, grid: { color: '#eef1f4' } }
            : { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: false, font: { size: narrow ? 10 : 12 } } },
          y: horizontal ? { grid: { display: false } } : { beginAtZero: true, suggestedMax: maxCount, ticks: { precision: 0 }, grid: { color: '#eef1f4' } }
        }
      },
      plugins: [valueLabels]
    });
  }

  function gridChart(canvas, agg) {
    return new Chart(canvas, {
      type: 'bar',
      data: {
        labels: agg.rows.map(function (r) { return wrapLabel(r.label, window.innerWidth < 640 ? 7 : 14); }),
        datasets: agg.columns.map(function (c, i) {
          return {
            label: c, backgroundColor: COLORS[i % COLORS.length], maxBarThickness: 28,
            data: agg.rows.map(function (r) { return r.counts[c]; })
          };
        })
      },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false, animation: { duration: 300 },
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 12 } } },
        scales: {
          x: { stacked: true, beginAtZero: true, ticks: { precision: 0 }, grid: { color: '#eef1f4' } },
          y: { stacked: true, grid: { display: false } }
        }
      }
    });
  }

  function chartBox(height) {
    var box = document.createElement('div');
    box.className = 'chart-box';
    box.style.height = height + 'px';
    var c = document.createElement('canvas');
    box.appendChild(c);
    return { box: box, canvas: c };
  }

  function othersBlock(others) {
    if (!others || !others.length) return null;
    var d = document.createElement('details');
    d.className = 'others';
    d.innerHTML = '<summary>「その他」の記入内容（' + others.length + '件）</summary><ul>' +
      others.map(function (o) { return '<li>' + esc(o) + '</li>'; }).join('') + '</ul>';
    return d;
  }

  function renderText(body, q, agg) {
    var input = document.createElement('input');
    input.type = 'search';
    input.className = 'search';
    input.placeholder = 'ことばで絞り込む';
    input.value = state.search[q.id] || '';
    var ul = document.createElement('ul');
    ul.className = 'answers';
    var more = document.createElement('button');
    more.type = 'button';
    more.className = 'btn btn-ghost more';
    more.textContent = 'さらに表示';

    function draw() {
      var words = (state.search[q.id] || '').toLowerCase().split(/[\s　]+/).filter(Boolean);
      var hits = agg.list.filter(function (x) {
        var v = x.v.toLowerCase();
        return words.every(function (w) { return v.indexOf(w) >= 0; });
      });
      var limit = state.shown[q.id] || PAGE;
      ul.innerHTML = hits.length ? hits.slice(0, limit).map(function (x) {
        var html = esc(x.v);
        words.forEach(function (w) {
          var re = new RegExp('(' + esc(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
          html = html.replace(re, '<mark>$1</mark>');
        });
        return '<li><time>' + fmtTime(x.t) + '</time>' + html + '</li>';
      }).join('') : '<li class="empty">' + (words.length ? '該当する回答はありません' : 'まだ回答がありません') + '</li>';
      more.hidden = hits.length <= limit;
      countLine.textContent = words.length ? hits.length + '件が該当（全' + agg.n + '件）' : agg.n + '件の回答（新しい順）';
    }

    var countLine = body.querySelector('.q-n');
    input.addEventListener('input', function () {
      state.search[q.id] = input.value;
      state.shown[q.id] = PAGE;
      draw();
    });
    more.addEventListener('click', function () {
      state.shown[q.id] = (state.shown[q.id] || PAGE) + PAGE;
      draw();
    });
    body.appendChild(input);
    body.appendChild(ul);
    body.appendChild(more);
    draw();
  }

  function renderQuestion(q, agg) {
    var el = document.createElement('article');
    el.className = 'q';
    var kind = agg.kind === 'number' ? '数値' : (KIND_LABEL[q.type] || '回答');
    el.innerHTML = '<div class="q-head"><h3 class="q-title">' + esc(q.title) + '</h3>' +
      '<span class="q-kind">' + esc(kind) + '</span></div><p class="q-n"></p>';
    var nLine = el.querySelector('.q-n');

    if (agg.kind === 'choice' || agg.kind === 'multi' || agg.kind === 'scale') {
      nLine.textContent = agg.n + '人が回答' + (agg.kind === 'multi' ? '（複数選択・割合は回答者数に対して）' : '');
      if (agg.kind === 'scale') {
        var avg = document.createElement('p');
        avg.className = 'avg-line';
        avg.innerHTML = '平均<strong>' + (agg.avg === null ? '–' : agg.avg) + '</strong>' +
          '<span class="q-kind">（' + agg.min + '〜' + agg.max + '）' +
          (q.minLabel || q.maxLabel ? '　' + esc(agg.min + '＝' + (q.minLabel || '') + '、' + agg.max + '＝' + (q.maxLabel || '')) : '') + '</span>';
        el.appendChild(avg);
      }
      var horizontal = agg.kind === 'multi';
      var h = horizontal ? Math.max(120, agg.items.length * 40 + 30) : 260;
      var cb = chartBox(h);
      el.appendChild(cb.box);
      state.charts[q.id] = { canvas: cb.canvas, make: function () {
        return barChart(cb.canvas, agg, horizontal, agg.kind === 'scale' ? '#3EB370' : '#0068B7');
      } };
      var o = othersBlock(agg.others);
      if (o) el.appendChild(o);
    } else if (agg.kind === 'grid') {
      nLine.textContent = agg.n + '人が回答';
      var gb = chartBox(Math.max(160, agg.rows.length * 44 + 60));
      el.appendChild(gb.box);
      state.charts[q.id] = { canvas: gb.canvas, make: function () { return gridChart(gb.canvas, agg); } };
    } else if (agg.kind === 'number') {
      nLine.textContent = agg.n + '人が回答';
      var k = document.createElement('div');
      k.className = 'kpis';
      [['平均', agg.avg], ['中央値', agg.median], ['最小', agg.min], ['最大', agg.max]].forEach(function (p) {
        k.innerHTML += '<div class="kpi"><span>' + p[0] + '</span><strong>' + p[1] + '</strong></div>';
      });
      el.appendChild(k);
    } else {
      renderText(el, q, agg);
    }
    return el;
  }

  function render() {
    var data = state.data;
    var list = $('results-list');
    Object.keys(state.charts).forEach(function (id) {
      if (state.charts[id].chart) state.charts[id].chart.destroy();
    });
    state.charts = {};
    list.innerHTML = '';

    var responses = data.responses || [];
    $('sum-count').textContent = responses.length + '件';
    var last = responses.reduce(function (m, r) { return String(r.t) > m ? String(r.t) : m; }, '');
    $('sum-last').textContent = last ? fmtTime(last) : '–';

    if (!(data.questions || []).length) {
      list.innerHTML = '<div class="notice"><p>公開できる質問がありません。</p></div>';
      return;
    }
    data.questions.forEach(function (q) {
      list.appendChild(renderQuestion(q, aggregate(q, responses)));
    });
    // DOM に入ってから描く（幅を正しく測るため）
    Object.keys(state.charts).forEach(function (id) {
      state.charts[id].chart = state.charts[id].make();
    });
    $('btn-csv').disabled = false;
  }

  /* ================= 更新 ================= */
  function signature(d) {
    var r = d.responses || [];
    return JSON.stringify(d.questions) + '|' + r.length + '|' + (r.length ? r[r.length - 1].t : '');
  }

  function accept(data) {
    state.lastFetch = Date.now();
    $('sum-fetched').textContent = fmtTime(new Date());
    var msg = $('results-msg');
    msg.className = 'results-msg';
    msg.textContent = '';
    var sig = signature(data);
    if (sig === state.signature) return;   // 変化がなければ描き直さない（検索欄などを保つ）
    state.signature = sig;
    state.data = data;
    render();
  }

  function load() {
    if (state.loading) return;
    state.loading = true;
    var btn = $('btn-refresh');
    btn.disabled = true;
    btn.textContent = '読み込み中…';
    fetchData(state.password).then(accept).catch(function (err) {
      var msg = $('results-msg');
      msg.className = 'results-msg error';
      msg.textContent = err && err.code === 'auth'
        ? '合言葉が変更されました。画面を再読み込みして入力し直してください。'
        : '最新の回答を読み込めませんでした（' + ((err && (err.message || err.code)) || '不明') + '）。少し待ってから「最新に更新」を押してください。';
    }).then(function () {
      state.loading = false;
      btn.disabled = false;
      btn.textContent = '最新に更新';
    });
  }

  function seconds() { return Math.max(15, Number(CFG.REFRESH_SECONDS) || 60); }

  function schedule() {
    clearInterval(state.timer);
    state.timer = null;
    if (!state.active || !$('auto-refresh').checked) return;
    state.timer = setInterval(function () {
      if (!document.hidden) load();
    }, seconds() * 1000);
  }

  function setup(opts) {
    state.password = opts.password;
    state.demo = !!opts.demo;
    $('auto-label').textContent = '自動で更新（' + seconds() + '秒ごと）';
    $('btn-refresh').addEventListener('click', load);
    $('auto-refresh').addEventListener('change', schedule);
    $('btn-csv').addEventListener('click', function () { Csv.download(getSummary()); });
    if (opts.initialData) accept(opts.initialData);
  }

  function setActive(on) {
    state.active = on;
    if (on && Date.now() - state.lastFetch > seconds() * 1000) load();
    schedule();
  }

  function getSummary() {
    var d = state.data || { questions: [], responses: [] };
    return {
      title: d.formTitle || 'LexxMoMa アンケート',
      count: (d.responses || []).length,
      fetchedAt: fmtTime(new Date(state.lastFetch)),
      rows: d.questions.map(function (q) {
        return { q: q, kind: KIND_LABEL[q.type] || '回答', agg: aggregate(q, d.responses || []) };
      })
    };
  }

  return { fetchData: fetchData, setup: setup, setActive: setActive, aggregate: aggregate, getSummary: getSummary };
})();
