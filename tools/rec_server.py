"""3D を使えない環境向けの録画を作るときのサーバー（content/media/scene-tour.mp4・cycle-race.mp4）。
使い方：python tools/rec_server.py <このフォルダ> <コマの保存先> 8751 → ブラウザで
  http://localhost:8751/content/pages/scene.html?record=1 （または cycle.html?record=1）を開き、
  ページの中で 1コマずつ進めて canvas.toDataURL を POST /__frame?name=f00000.jpg へ送る。
  そのあと tools/encode_frames.py で mp4 にする。3D の形や見学の順番を変えたら撮り直す。
"""
import base64, http.server, os, sys, urllib.parse
ROOT, OUT, PORT = sys.argv[1], sys.argv[2], int(sys.argv[3])
os.makedirs(OUT, exist_ok=True)
class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=ROOT, **k)
    def log_message(self, *a): pass
    def do_POST(self):
        q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        name = os.path.basename(q.get('name', ['x.jpg'])[0])
        data = self.rfile.read(int(self.headers.get('Content-Length', 0))).decode()
        open(os.path.join(OUT, name), 'wb').write(base64.b64decode(data.split(',', 1)[1]))
        self.send_response(204); self.end_headers()
http.server.ThreadingHTTPServer(('127.0.0.1', PORT), H).serve_forever()
