/* 集計結果を CSV で保存（Excel で文字化けしないよう BOM 付き UTF-8） */
var Csv = (function () {
  'use strict';

  var HEADER = ['質問', '形式', '項目', '件数', '割合(%)', '回答者数', '平均', '中央値', '最小', '最大'];

  function cell(v) {
    if (v === null || v === undefined) return '';
    var s = String(v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function rowsOf(r) {
    var t = r.q.title, k = r.kind, a = r.agg;
    switch (a.kind) {
      case 'choice':
      case 'multi':
        return a.items.map(function (it) { return [t, k, it.label, it.count, it.pct, a.n]; });
      case 'scale':
        return a.items.map(function (it) { return [t, k, it.label, it.count, it.pct, a.n, a.avg]; });
      case 'number':
        return [[t, '数値', '', '', '', a.n, a.avg, a.median, a.min, a.max]];
      case 'grid':
        var out = [];
        a.rows.forEach(function (row) {
          a.columns.forEach(function (c) {
            out.push([t, k, row.label + '：' + c, row.counts[c], row.n ? Math.round(row.counts[c] / row.n * 1000) / 10 : 0, row.n]);
          });
        });
        return out;
      default:
        return [[t, k, '（記述式の回答）', a.n, '', a.n]];
    }
  }

  function download(summary) {
    var lines = [
      ['アンケート', summary.title],
      ['回答数', summary.count],
      ['集計日時', summary.fetchedAt],
      [],
      HEADER
    ];
    summary.rows.forEach(function (r) { lines = lines.concat(rowsOf(r)); });
    var text = '﻿' + lines.map(function (l) { return l.map(cell).join(','); }).join('\r\n');

    var d = new Date();
    var p = function (x) { return ('0' + x).slice(-2); };
    var name = 'lexxmoma-survey-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + '.csv';
    var url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  return { download: download, rowsOf: rowsOf };
})();
