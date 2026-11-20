#!/usr/bin/env python3
"""Jàngal demo video — post-production.

Muxes the Playwright recording with:
  - the 11 voiceover clips placed at their exact scene offsets (timeline.json)
  - a subtle synthesized ambient bed (G-chord pad, ~-25 dB)
  - loudness normalization (-16 LUFS), H.264 1080p30, faststart
"""
import json, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REC = HERE / "recording"
OUT = Path("/home/z/my-project/download/jangal/docs/demo-video.mp4")
OUT2 = Path("/home/z/my-project/download/Jangal-Demo-Dakar-Bitcoin-Hack-2026.mp4")

tl = json.load(open(HERE / "timeline.json"))
vo = json.load(open(HERE / "vo.json"))
ORDER = ["s01","s02","s03","s04","s05","s06","s07","s08","s09","s10","s11"]

# the webm starts at context creation; t0 is when scene 1 began
offset0 = tl["_t0"] - tl["_ctx_start"]
total = offset0 + tl["s11"]["end"] + 1.2
print(f"offset0={offset0:.2f}s  total={total:.2f}s")

video_files = sorted(REC.glob("*.webm"))
assert video_files, "no webm recording found"
video = video_files[-1]
print("video:", video)

dur = float(subprocess.run(["ffprobe","-v","error","-show_entries","format=duration",
    "-of","csv=p=0",str(video)],capture_output=True,text=True).stdout.strip())
print(f"webm duration: {dur:.2f}s (timeline says {total:.2f}s)")
total = min(total, dur)  # never run past the recording

# ---------- build filter graph ----------
inputs = ["-threads", "1", "-i", str(video)]   # single-thread libvpx decode (sandbox thread cap)
for s in ORDER:
    inputs += ["-i", str(HERE / "vo" / f"{s}.wav")]

parts, mix_ins = [], []
for i, s in enumerate(ORDER, start=1):
    at = offset0 + tl[s]["audio_at"]
    ms = int(round(at * 1000))
    parts.append(f"[{i}:a]aresample=44100,aformat=channel_layouts=stereo,adelay={ms}:all=1[n{i}]")
    mix_ins.append(f"[n{i}]")

bed = (f"aevalsrc='(0.30*sin(2*PI*98*t)+0.22*sin(2*PI*146.83*t)+0.18*sin(2*PI*196*t)"
       f"+0.10*sin(2*PI*293.66*t))*(0.72+0.28*sin(2*PI*0.045*t))':s=44100:d={total:.2f},"
       f"lowpass=f=520,aecho=0.7:0.5:120|240:0.25|0.15,volume=0.05,"
       f"afade=t=in:d=3,afade=t=out:st={total-4:.2f}:d=4,aresample=44100[bed]")

narr = "".join(mix_ins)
graph = ";".join(parts + [bed,
    f"{narr}amix=inputs={len(ORDER)}:duration=longest:normalize=0[nar]",
    "[nar][bed]amix=inputs=2:duration=first:normalize=0,"
    "loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[aout]"])

cmd = ["ffmpeg","-y", *inputs, "-filter_complex", graph,
       "-map","0:v","-map","[aout]",
       "-t", f"{total:.2f}",
       "-c:v","libx264","-crf","17","-preset","veryfast","-pix_fmt","yuv420p","-r","30",
       "-threads","4",
       "-c:a","aac","-b:a","192k",
       "-movflags","+faststart",
       str(OUT)]
print(" ".join(cmd)[:400], "...")
r = subprocess.run(cmd, capture_output=True, text=True)
if r.returncode != 0:
    print(r.stderr[-3000:]); sys.exit(1)

OUT2.parent.mkdir(exist_ok=True)
subprocess.run(["cp", str(OUT), str(OUT2)], check=True)

# ---------- report ----------
p = subprocess.run(["ffprobe","-v","error","-show_entries",
    "format=duration,size,bit_rate","-of","json",str(OUT)],capture_output=True,text=True)
info = json.loads(p.stdout)["format"]
print(f"\nFINAL: {OUT}")
print(f"  duration {float(info['duration']):.1f}s  size {int(info['size'])/1e6:.1f} MB")
