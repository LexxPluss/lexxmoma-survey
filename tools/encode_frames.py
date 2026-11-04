"""rec_server.py で集めたコマを mp4（H.264・30コマ/秒）と表紙 jpg にする。
使い方：python tools/encode_frames.py <コマのフォルダ> <名前の頭 f|c> <出力mp4> <出力jpg> <幅 1280|1200>
（ffmpeg は pip の imageio-ffmpeg に入っているものを使う）
"""
import subprocess, sys, os
import imageio_ffmpeg
from PIL import Image
frames, prefix, out_mp4, out_jpg, width = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], int(sys.argv[5])
ff = imageio_ffmpeg.get_ffmpeg_exe()
cmd = [ff, '-y', '-loglevel', 'error', '-framerate', '30', '-i', os.path.join(frames, prefix + '%05d.jpg'),
       '-vf', 'scale=%d:-2:flags=lanczos' % width, '-c:v', 'libx264', '-preset', 'slow', '-crf', '27',
       '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', out_mp4]
subprocess.run(cmd, check=True)
im = Image.open(os.path.join(frames, prefix + '00000.jpg')).convert('RGB')
im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS); im.save(out_jpg, 'JPEG', quality=82, optimize=True)
print(os.path.getsize(out_mp4), os.path.getsize(out_jpg))
