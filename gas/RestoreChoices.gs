/**
 * Q4-1（工場）と Q5-1（横展開に必要なもの）の選択肢と「1〜3つ」の上限を入れ直す。
 * フォームを作ったときと同じ Apps Script に貼り付け、restoreLexxMoMaChoices を1回実行する。
 * 質問の文言・順番・分岐には触らない。
 */
function restoreLexxMoMaChoices() {
  var form = FormApp.openById('1ShZlYeW5G4fPyHPoUsZ2Xfi18CoKVMHJmLR9Wfm8uuo');
  var targets = [
    {
      prefix: 'Q4-1 ',
      choices: [
        '本社工場（鍛造・ハイブリッド・FC・シャシー部品）', '元町工場（車両）', '上郷工場（エンジン）', '高岡工場（車両）',
        '三好工場（駆動・鍛造・エンジン関係部品）', '堤工場（車両）', '明知工場（駆動関係部品・鋳造部品）',
        '下山工場（エンジン・FCタンク）', '衣浦工場（駆動関係部品）', '田原工場（車両・エンジン）', '貞宝工場（機械設備・金型）',
        '上記以外の拠点を提案したい（Q4-3に記入）', '現時点では候補なし', '工場ごとの事情が分からず判断できない'
      ]
    },
    {
      prefix: 'Q5-1 ',
      choices: [
        '適用できる工程・条件を判断するための事例集・評価基準', '工場ごとの差分を整理し、必要な変更を見積もる仕組み',
        '作業設定・レシピ・接続設定を再利用できるテンプレート', '現場担当者が設定変更・品種追加できる操作性',
        '導入時の立ち上げ・検証・安全評価の支援', '現場担当者向けの教育・マニュアル・トレーニング',
        '異常時の切り分け・復旧・保全を支える仕組み', '複数工場の稼働状況・効果を比較し、改善を共有する仕組み',
        '社内推進体制・責任分担・問い合わせ窓口の整備', '導入・展開に必要な費用と投資対効果の分かりやすさ',
        '現状の内容で十分', 'その他', '判断できない'
      ]
    }
  ];
  targets.forEach(function (t) {
    var found = form.getItems(FormApp.ItemType.CHECKBOX).filter(function (it) {
      return it.getTitle().indexOf(t.prefix) === 0;
    });
    if (found.length !== 1) throw new Error(t.prefix + 'の質問が見つからないか、複数あります（' + found.length + '件）');
    var item = found[0].asCheckboxItem();
    item.showOtherOption(false).setChoiceValues(t.choices);
    item.setValidation(FormApp.createCheckboxValidation()
      .requireSelectAtMost(3)
      .setHelpText('1〜3つ選択してください。')
      .build());
    Logger.log(t.prefix + 'の選択肢を ' + item.getChoices().length + ' 個にしました');
  });
}
