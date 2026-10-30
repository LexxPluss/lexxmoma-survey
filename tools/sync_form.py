"""公開中の Google フォームから質問を読み取り、js/questions.js を作り直す。

使い方：  python tools/sync_form.py
  - フォームの URL は js/config.js の FORM_URL から読みます。
  - フォームが未公開（ログインが必要）のときは何も変えずに終わります。
  - 内容が前回と同じなら、ファイルは書き換えません（GitHub の自動実行で無駄な更新を出さないため）。
"""
import json
import os
import re
import sys
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG = os.path.join(ROOT, 'js', 'config.js')
OUT = os.path.join(ROOT, 'js', 'questions.js')

# Google フォーム内部の質問形式の番号
TYPES = {0: 'text', 1: 'paragraph', 2: 'radio', 3: 'dropdown', 4: 'checkbox', 5: 'scale',
         7: 'grid', 9: 'date', 10: 'time', 18: 'rating'}
HEADER, PAGE = 6, 8
WARN = []   # フォーム側の不具合らしきもの（実行ログに出す）
BLOCK = []  # 送信できなくなる不具合（画面は Google フォームへの案内に切り替える）
SKIP = {11, 12, 13}  # 画像・動画・ファイルのアップロードは扱わない


def form_url():
    with open(CONFIG, encoding='utf-8') as f:
        m = re.search(r"FORM_URL:\s*'([^']+)'", f.read())
    if not m:
        sys.exit('js/config.js に FORM_URL が見つかりません')
    url = m.group(1).split('?')[0]
    return url if url.endswith('/viewform') else url.rstrip('/') + '/viewform'


def fetch(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'ja'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode('utf-8')


def limits_from_help(help_text):
    """説明文の「1〜3つ」から選べる数を、「『A』『B』…これらは単独で」から単独で選ぶ選択肢を読む"""
    lo = hi = None
    m = re.search(r'(\d+)\s*[〜~～\-－]\s*(\d+)\s*つ', help_text or '')
    if m:
        lo, hi = int(m.group(1)), int(m.group(2))
    exclusive = []
    for sentence in re.split(r'[。\n]', help_text or ''):
        if '単独' in sentence:
            exclusive += re.findall(r'「([^」]+)」', sentence)
    return lo, hi, exclusive


def normalize(fb, html):
    data = fb[1]
    items = data[1] or []
    title = (data[8] if len(data) > 8 and data[8] else fb[3]) or ''
    pages = [{'id': None, 'title': '', 'description': '', 'items': []}]
    page_ids = {}
    for it in items:
        kind = it[3]
        if kind == PAGE:
            page_ids[it[0]] = len(pages)
            pages.append({'id': it[0], 'title': it[1] or '', 'description': it[2] or '', 'items': []})
    page = 0
    for it in items:
        kind = it[3]
        if kind == PAGE:
            page += 1
            continue
        if kind in SKIP:
            continue
        if kind == HEADER:
            # 1ページ目の先頭の見出しは、そのページの名前として使う
            if page == 0 and not pages[0]['items'] and not pages[0]['title']:
                pages[0]['title'], pages[0]['description'] = it[1] or '', it[2] or ''
            else:
                pages[page]['items'].append({'kind': 'header', 'title': it[1] or '', 'description': it[2] or ''})
            continue
        if kind not in TYPES:
            continue
        detail = (it[4] or [[None]])[0]
        q = {'kind': 'question', 'id': it[0], 'type': TYPES[kind], 'title': it[1] or '', 'help': it[2] or '',
             'entry': detail[0], 'required': bool(detail[2]) if len(detail) > 2 else False}
        m = re.match(r'^Q(\d+(?:-\d+)?)', q['title'])   # 「Q5」「Q1-3」の形
        if m:
            q['no'] = 'Q' + m.group(1)
        if kind in (2, 3, 4):
            q['choices'] = []
            for c in detail[1] or []:
                if not c[0]:
                    continue   # 空の選択肢は使わない
                if len(c) > 4 and c[4]:
                    q['hasOther'] = True
                    continue
                choice = {'value': c[0]}
                if len(c) > 2 and c[2]:
                    choice['goto'] = page_ids.get(c[2], 'submit' if c[2] == -3 else None)
                q['choices'].append(choice)
        if kind == 5:
            vals = [c[0] for c in detail[1] or []]
            q['min'], q['max'] = int(vals[0]), int(vals[-1])
            labels = detail[3] if len(detail) > 3 and detail[3] else ['', '']
            q['minLabel'], q['maxLabel'] = labels[0] or '', labels[1] or ''
        if kind == 18:
            q['min'], q['max'] = 1, len(detail[1] or []) or 5
        if kind == 7:
            q['rows'] = [(row[3] or [''])[0] for row in it[4]]
            q['rowEntries'] = [row[0] for row in it[4]]
            q['columns'] = [c[0] for c in detail[1] or []]
        if kind == 4:
            lo, hi, ex = limits_from_help(q['help'])
            if hi:
                q['minSelect'], q['maxSelect'] = lo, hi
            values = [c['value'] for c in q['choices']]
            ex = [v for v in ex if v in values]
            if ex:
                q['exclusive'] = ex
        if kind in (2, 3, 4) and not q['choices']:
            WARN.append(f'選択肢がありません：{q["title"][:40]}')
            if q['required']:
                # 必須なのに選べない質問があると、外の画面からの送信は Google に受け付けられない
                BLOCK.append(f'必須の質問に選択肢がありません：{q["title"][:40]}')
        pages[page]['items'].append(q)
    # 「回答のコピーを回答者に送信」が常にオン（設定値 3）だと、送信時に Google が reCAPTCHA を求めるため、
    # 外の画面からの送信は受け付けられない（2026-10 に実際の送信で確認。オフにすると 2 になり受け付けられた）
    settings = data[10] if len(data) > 10 and data[10] else []
    if len(settings) > 3 and settings[3] == 3:
        BLOCK.append('フォームの「回答のコピーを回答者に送信」がオンです。オフにしてください。')
    elif len(settings) > 3 and settings[3] not in (2, None):
        WARN.append(f'回答のコピー送信の設定が想定外です（{settings[3]}）。テスト送信で確かめてください。')
    return {
        'title': title,
        'description': data[0] or '',
        'collectEmail': 'autocomplete="email"' in html,
        'pages': pages,
    }


def main():
    url = form_url()
    try:
        html = fetch(url)
    except urllib.error.HTTPError as e:
        print(f'::warning::フォームを読めませんでした（{e.code}）。未公開か、ログインが必要な設定です。何も変更していません。')
        return 0
    m = re.search(r'FB_PUBLIC_LOAD_DATA_ = (.*?);</script>', html, re.S)
    if not m:
        print('::warning::フォームの質問データが見つかりませんでした。何も変更していません。')
        return 0
    form = normalize(json.loads(m.group(1)), html)
    titles = [i['title'] for p in form['pages'] for i in p['items'] if i['kind'] == 'question']
    for t in sorted({t for t in titles if titles.count(t) > 1}):
        WARN.append(f'同じ質問が複数あります：{t[:40]}')
    # 説明文・選択肢の中の「Q○」が、今は無い番号を指していないか（番号を振り直したときの直し忘れ）
    nos = {i.get('no') for p in form['pages'] for i in p['items'] if i['kind'] == 'question'}
    for p in form['pages']:
        for i in p['items']:
            if i['kind'] != 'question':
                continue
            text = i['help'] + ' '.join(c['value'] for c in i.get('choices', []))
            stale = sorted({r for r in re.findall(r'Q\d+(?:-\d+)?', text) if r not in nos})
            if stale:
                WARN.append(f'{i.get("no", "")} の説明に、今は無い番号があります：{"・".join(stale)}')
    for w in WARN:
        print('::warning::' + w)
    form['formUrl'] = url
    form['ready'] = True
    form['problems'] = BLOCK
    body = json.dumps(form, ensure_ascii=False, indent=1)
    text = ('/* このファイルは tools/sync_form.py が Google フォームから自動で作ります。手で直さないでください。 */\n'
            f'window.SURVEY_FORM = {body};\n')
    old = open(OUT, encoding='utf-8').read() if os.path.exists(OUT) else ''
    if old == text:
        print('質問に変更はありません。')
        return 0
    with open(OUT, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)
    n = sum(1 for p in form['pages'] for i in p['items'] if i['kind'] == 'question')
    print(f'js/questions.js を更新しました（{len(form["pages"])}ページ・{n}問）。')
    return 0


if __name__ == '__main__':
    sys.exit(main())
