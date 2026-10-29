/**
 * LexxMoMa アンケート：回答データを返すウェブアプリ
 *
 * 回答が集まるスプレッドシートから「拡張機能 → Apps Script」を開き、
 * このファイルの中身をすべて貼り付けて使います（手順は README.md）。
 *
 * ・質問の構造（タイトル・形式・選択肢）はフォームから毎回読み取ります。
 *   フォームを編集すれば、画面のグラフも自動で変わります。
 * ・返すのは「フォームの質問に対応する列」だけです。
 *   メールアドレスの自動収集の列や、シートに手で足した列は返しません。
 * ・合言葉は「プロジェクトの設定 → スクリプト プロパティ」に
 *   VIEW_PASSWORD という名前で登録します。未登録のあいだは何も返しません。
 */

/* ===================== 設定（ここだけ変更します） ===================== */

// 公開しない質問。質問タイトルに、ここに書いた言葉が「含まれる」と除外します。
// 例：'お名前' と書くと「お名前」「お名前（ふりがな）」の両方が除外されます。
var EXCLUDE_TITLES = [
  '氏名',
  'お名前',
  '名前',
  'メールアドレス',
  '会社名',
  '貴社名',
  '所属',
  '電話'
];

// 記述式のうち、必ず「数値」として集計する質問（タイトルの一部）
var NUMERIC_TITLES = [];

// 記述式のうち、数字だけの回答でも「数値」として扱わない質問（タイトルの一部）
var NOT_NUMERIC_TITLES = [];

// 同じ結果を使い回す秒数（多くの人が同時に開いても動作が重くならないように）
var CACHE_SECONDS = 30;

// スプレッドシートに紐づいていないスクリプトとして使う場合だけ設定します。
// 通常（スプレッドシートの「拡張機能」から作った場合）は空のままで構いません。
var SPREADSHEET_URL = '';
var FORM_URL = '';   // フォームの編集画面のURL（空ならスプレッドシートから自動で探します）

/* ===================================================================== */

var SKIP_TYPES = ['SECTION_HEADER', 'PAGE_BREAK', 'IMAGE', 'VIDEO', 'FILE_UPLOAD'];

function doGet(e) {
  var params = (e && e.parameter) || {};
  var expected = PropertiesService.getScriptProperties().getProperty('VIEW_PASSWORD');
  if (!expected) {
    return json_({ ok: false, error: 'nopassword', message: '合言葉が未設定です' });
  }
  if (String(params.pw || '') !== String(expected)) {
    Utilities.sleep(800); // 総当たりを遅らせる
    return json_({ ok: false, error: 'auth' });
  }
  try {
    return json_(getPayload_());
  } catch (err) {
    return json_({ ok: false, error: 'server', message: String(err && err.message || err) });
  }
}

/** エディタで実行して、返す内容を確認するための関数（ログに表示） */
function testOutput() {
  var p = buildPayload_();
  Logger.log('フォーム：' + p.formTitle);
  Logger.log('公開する質問：' + p.questions.length + '問');
  p.questions.forEach(function (q) { Logger.log('  - [' + q.type + '] ' + q.title); });
  Logger.log('除外した質問：' + p.excluded.join(' / '));
  Logger.log('回答数：' + p.responses.length);
  if (p.responses.length) Logger.log('最新の回答：' + JSON.stringify(p.responses[p.responses.length - 1]));
}

/* ---------- ここから下は通常は変更不要です ---------- */

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function getPayload_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('payload');
  if (hit) return JSON.parse(hit);
  var p = buildPayload_();
  delete p.excluded; // 除外した質問名は外に出さない
  try { cache.put('payload', JSON.stringify(p), CACHE_SECONDS); } catch (err) { /* 大きすぎる場合は使い回さない */ }
  return p;
}

function openSpreadsheet_() {
  if (SPREADSHEET_URL) return SpreadsheetApp.openByUrl(SPREADSHEET_URL);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('スプレッドシートが見つかりません（SPREADSHEET_URL を設定してください）');
  return ss;
}

function openForm_(ss) {
  if (FORM_URL) return FormApp.openByUrl(FORM_URL);
  var url = ss.getFormUrl();
  if (!url) throw new Error('フォームが見つかりません（FORM_URL を設定してください）');
  return FormApp.openByUrl(url);
}

// フォームの回答が入るシートを探す（複数あれば、フォームに紐づくもの）
function findSheet_(ss, form) {
  var sheets = ss.getSheets();
  var id = form.getId();
  for (var i = 0; i < sheets.length; i++) {
    var u = sheets[i].getFormUrl();
    if (u && u.indexOf(id) >= 0) return sheets[i];
  }
  for (var j = 0; j < sheets.length; j++) {
    if (sheets[j].getFormUrl()) return sheets[j];
  }
  return sheets[0];
}

function matchAny_(title, list) {
  return list.some(function (w) { return w && title.indexOf(w) >= 0; });
}

function choiceValues_(choices) {
  return choices.map(function (c) { return c.getValue(); });
}

// フォームの質問1つを、画面に渡す形にする
function describeItem_(item, index) {
  var type = String(item.getType());
  var q = { id: 'q' + (index + 1), title: item.getTitle(), type: type };
  try {
    switch (type) {
      case 'MULTIPLE_CHOICE':
        q.choices = choiceValues_(item.asMultipleChoiceItem().getChoices());
        q.hasOther = item.asMultipleChoiceItem().hasOtherOption();
        break;
      case 'LIST':
        q.choices = choiceValues_(item.asListItem().getChoices());
        break;
      case 'CHECKBOX':
        q.choices = choiceValues_(item.asCheckboxItem().getChoices());
        q.hasOther = item.asCheckboxItem().hasOtherOption();
        break;
      case 'SCALE':
        var s = item.asScaleItem();
        q.min = s.getLowerBound(); q.max = s.getUpperBound();
        q.minLabel = s.getLeftLabel(); q.maxLabel = s.getRightLabel();
        break;
      case 'RATING':
        q.min = 1; q.max = item.asRatingItem().getRatingScaleLevel();
        break;
      case 'GRID':
        q.rows = item.asGridItem().getRows(); q.columns = item.asGridItem().getColumns();
        break;
      case 'CHECKBOX_GRID':
        q.rows = item.asCheckboxGridItem().getRows(); q.columns = item.asCheckboxGridItem().getColumns();
        break;
    }
  } catch (err) {
    // 新しい形式などで詳細が取れない場合は、記述式と同じ一覧表示になる
  }
  if (type === 'RATING' && !q.max) q.max = 5;
  if (matchAny_(q.title, NUMERIC_TITLES)) q.numeric = true;
  if (matchAny_(q.title, NOT_NUMERIC_TITLES)) q.numeric = false;
  return q;
}

// 「A, B, C」の形で入っている複数選択を、選択肢の一覧を手がかりに分ける
// （選択肢そのものに「, 」が含まれていても正しく分けられるように）
function splitByChoices_(cell, choices) {
  var rest = ', ' + cell + ', ';
  var picked = [];
  choices.slice().sort(function (a, b) { return b.length - a.length; }).forEach(function (c) {
    var token = ', ' + c + ', ';
    var at = rest.indexOf(token);
    if (at >= 0) {
      picked.push({ at: at, v: c });
      rest = rest.slice(0, at) + ', ' + new Array(c.length + 1).join('\u0000') + ', ' + rest.slice(at + token.length);
    }
  });
  picked.sort(function (a, b) { return a.at - b.at; });
  var out = picked.map(function (p) { return p.v; });
  var other = rest.split(', ').map(function (s) { return s.replace(/\u0000/g, '').trim(); })
    .filter(function (s) { return s; }).join(', ');
  if (other) out.push(other);
  return out;
}

function buildPayload_() {
  var ss = openSpreadsheet_();
  var form = openForm_(ss);
  var sheet = findSheet_(ss, form);

  var questions = [];
  var excluded = [];
  form.getItems().forEach(function (item) {
    var type = String(item.getType());
    if (SKIP_TYPES.indexOf(type) >= 0) return;
    if (matchAny_(item.getTitle(), EXCLUDE_TITLES)) { excluded.push(item.getTitle()); return; }
    questions.push(describeItem_(item, questions.length + excluded.length));
  });

  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 1 || lastCol < 1) {
    return { ok: true, formTitle: form.getTitle(), generatedAt: new Date().toISOString(), questions: questions, responses: [], excluded: excluded };
  }
  var headers = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0].map(function (h) { return String(h).trim(); });

  // 質問とシートの列を、見出しの文字で対応づける
  var used = {};
  function takeColumn(test) {
    for (var c = 1; c < headers.length; c++) {
      if (!used[c] && test(headers[c])) { used[c] = true; return c; }
    }
    return -1;
  }
  questions.forEach(function (q) {
    if (q.type === 'GRID' || q.type === 'CHECKBOX_GRID') {
      q._cols = {};
      (q.rows || []).forEach(function (row) {
        var name = q.title + ' [' + row + ']';
        q._cols[row] = takeColumn(function (h) { return h === name; });
      });
    } else {
      q._col = takeColumn(function (h) { return h === q.title.trim(); });
    }
  });

  var responses = [];
  if (lastRow >= 2) {
    var raw = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
    var shown = sheet.getRange(2, 1, lastRow - 1, lastCol).getDisplayValues();
    for (var r = 0; r < raw.length; r++) {
      var ts = raw[r][0];
      if (!ts) continue; // 空の行
      var a = {};
      questions.forEach(function (q) {
        if (q._cols) {
          var g = {};
          Object.keys(q._cols).forEach(function (row) {
            var c = q._cols[row];
            var v = c >= 0 ? shown[r][c] : '';
            if (!v) return;
            g[row] = q.type === 'CHECKBOX_GRID' ? splitByChoices_(v, q.columns || []) : v;
          });
          if (Object.keys(g).length) a[q.id] = g;
          return;
        }
        if (q._col < 0) return;
        var cell = shown[r][q._col];
        if (cell === '' || cell === null) return;
        if (q.type === 'CHECKBOX') a[q.id] = splitByChoices_(cell, q.choices || []);
        else if (q.type === 'SCALE' || q.type === 'RATING') a[q.id] = Number(raw[r][q._col]);
        else a[q.id] = cell;
      });
      responses.push({ t: ts instanceof Date ? ts.toISOString() : String(ts), a: a });
    }
  }

  questions.forEach(function (q) { delete q._col; delete q._cols; });
  return {
    ok: true,
    formTitle: form.getTitle(),
    generatedAt: new Date().toISOString(),
    questions: questions,
    responses: responses,
    excluded: excluded
  };
}
