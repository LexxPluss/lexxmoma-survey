/* 確認用のダミーデータ（Apps Script が返す JSON と同じ形）
 * js/config.js の API_URL が空のとき、または URL に ?demo=1 を付けたときに使われます。 */
var DemoData = (function () {
  'use strict';

  var questions = [
    { id: 'q1', title: '貴社の業種を教えてください', type: 'LIST',
      choices: ['自動車・輸送機器', '電機・電子部品', '食品・医薬品', '物流・倉庫', '金属・機械加工', 'その他'] },
    { id: 'q2', title: 'LexxMoMa への関心の度合いは？', type: 'MULTIPLE_CHOICE',
      choices: ['すぐにでも検討したい', '1年以内に検討したい', '情報収集の段階', '今のところ予定はない'] },
    { id: 'q3', title: '任せたい作業（当てはまるものすべて）', type: 'CHECKBOX',
      choices: ['工程間の運搬', '部品の取り出し・供給', '機械への部品の出し入れ', '検査工程への受け渡し', '夜間の無人運転', '見回り・点検'] },
    { id: 'q4', title: '本日の説明はわかりやすかったですか', type: 'SCALE',
      min: 1, max: 5, minLabel: 'わかりにくい', maxLabel: 'わかりやすい' },
    { id: 'q5', title: '紹介した構想への期待度', type: 'RATING', min: 1, max: 5 },
    { id: 'q6', title: '導入するとしたら何台くらい必要ですか（台数）', type: 'TEXT' },
    { id: 'q7', title: '導入にあたって重視する点', type: 'GRID',
      rows: ['価格', '安全性', '導入までの期間', '保守の体制'], columns: ['とても重視', '重視', 'あまり重視しない'] },
    { id: 'q8', title: 'LexxMoMa に期待する機能や、ご要望をお聞かせください', type: 'PARAGRAPH_TEXT' },
    { id: 'q9', title: 'その他、ご意見があればお書きください', type: 'TEXT' }
  ];

  var COMMENTS = [
    '人手不足が深刻なので、夜間の運搬を任せられると助かります。',
    '既存の棚やコンベアをそのまま使えるかが気になります。',
    '安全柵なしで人と一緒に働けるかを詳しく知りたいです。',
    '導入費用の目安と、投資の回収期間の考え方を教えてほしい。',
    '複数の工程をまたいで使えるなら検討したい。',
    '部品の形がばらばらなので、つかめるかどうか試してみたい。',
    '保守の体制（地方の拠点）について知りたいです。',
    '段差やスロープのある床でも走れるかが気になりました。',
    '小さく試してから台数を増やす進め方ができると良い。',
    'エレベーターとの連携はできますか。'
  ];
  var SHORT = ['ありがとうございました', '実機を見てみたい', '資料がほしいです', '価格表がほしい', '詳しい方と話したい', ''];

  var seed = 7;
  function rnd() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }
  function pick(arr, w) {
    if (!w) return arr[Math.floor(rnd() * arr.length)];
    var s = w.reduce(function (a, b) { return a + b; }, 0), r = rnd() * s;
    for (var i = 0; i < arr.length; i++) { r -= w[i]; if (r <= 0) return arr[i]; }
    return arr[arr.length - 1];
  }

  function makeResponse(t) {
    var a = {};
    a.q1 = rnd() < .06 ? '化学・樹脂' : pick(questions[0].choices.slice(0, 5), [5, 3, 2, 3, 4]);
    a.q2 = pick(questions[1].choices, [2, 4, 5, 1]);
    a.q3 = questions[2].choices.filter(function (c, i) { return rnd() < [.7, .55, .45, .3, .4, .2][i]; });
    if (rnd() < .08) a.q3.push('箱の積み下ろし');
    a.q4 = pick([2, 3, 4, 5], [1, 3, 6, 5]);
    a.q5 = pick([1, 2, 3, 4, 5], [1, 1, 4, 6, 4]);
    if (rnd() < .8) a.q6 = String(pick([1, 2, 3, 5, 10, 20], [4, 5, 4, 3, 2, 1]));
    a.q7 = {};
    questions[6].rows.forEach(function (row, i) {
      a.q7[row] = pick(questions[6].columns, [[5, 4, 1], [8, 2, 0.5], [3, 5, 2], [4, 4, 2]][i]);
    });
    if (rnd() < .6) a.q8 = pick(COMMENTS);
    var s = pick(SHORT);
    if (s) a.q9 = s;
    return { t: t.toISOString(), a: a };
  }

  var responses = [];
  var start = Date.now() - 3 * 24 * 3600e3;
  for (var i = 0; i < 42; i++) {
    responses.push(makeResponse(new Date(start + i * (3 * 24 * 3600e3 / 42) + rnd() * 3600e3)));
  }

  // grow=true のとき、ときどき回答を1件増やす（自動更新の見え方を確認するため）
  function snapshot(grow) {
    if (grow && responses.length && rnd() < .5) responses.push(makeResponse(new Date()));
    return JSON.parse(JSON.stringify({
      ok: true,
      formTitle: 'LexxMoMa アンケート（確認用）',
      generatedAt: new Date().toISOString(),
      questions: questions,
      responses: responses
    }));
  }

  return { snapshot: snapshot };
})();
