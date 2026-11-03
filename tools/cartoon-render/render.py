#!/usr/bin/env python3
"""cartoon-render: Forge packs -> a staged, lip-synced cartoon episode (MP4).

Reads a project directory:
  script.json   {title, subtitle, marks: {scene: {charId: [feetX, feetY, heightPx]}},
                 scenes: [{id, bg, lines: [[speaker, pose, text], ...]}]}
  shots.json    [{lines: [lineIdx, ...], bg: sceneId,
                  cam: [cx0, cy0, z0, cx1, cy1, z1] | ["closeup", charId, z0, z1]
                       | ["two", charA, charB, z0, z1],
                  cast: {charId: null | {"enter": [fromX, delaySec, durSec]}},
                  react: [[lineIdx, [charId, ...], pose]]}]
  voices.json   {charId: {"model": "amy", "pitch": 1.0, "length": 1.0}}  (Piper)
  assets/       background plates named by each scene's "bg"

Characters come from Forge packs (default: the repo's examples/). Per-pose
mouth/eye placement uses the pack's talk.poseAnchors when present (v0.7+);
without them it falls back to the base patch rects for every pose, which
drifts on gesture poses — run the anchors workflow for production quality.

Lip-sync is driven by the real audio envelope; speakers change gesture at
phrase boundaries; listeners blink and idle-bob; entrances walk (bob + rock).
Camera shots are crops of the 1920x1080 stage: push-ins, pans, close-ups.

Requires: python3 + Pillow + numpy, ffmpeg, piper-tts (voices in $PIPER_VOICES,
default ~/.piper-voices, model = <name>.onnx there).
Usage: python3 render.py <project_dir> [packs_dir] [out.mp4]
"""
import json, math, os, random, re, subprocess, sys, textwrap, wave
import numpy as np
from PIL import Image, ImageDraw, ImageFont

PROJECT = os.path.abspath(sys.argv[1])
TOOL_DIR = os.path.dirname(os.path.abspath(__file__))
PACKS = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else os.path.join(TOOL_DIR, "..", "..", "examples")
OUT = sys.argv[3] if len(sys.argv) > 3 else os.path.join(PROJECT, "episode.mp4")
SCRIPT = json.load(open(f"{PROJECT}/script.json"))
SHOTS = json.load(open(f"{PROJECT}/shots.json"))
VOICES = json.load(open(f"{PROJECT}/voices.json"))
MARKS = SCRIPT["marks"]
W, H, FPS, SR = 1920, 1080, 24, 44100
GAP, TITLE_T, END_T = 0.35, 2.8, 3.6
PIPER = os.environ.get("PIPER_BIN", "piper")
PIPER_VOICES = os.environ.get("PIPER_VOICES", os.path.expanduser("~/.piper-voices"))
FONT_B = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
random.seed(7)

SCENE_BG = {s["id"]: s["bg"] for s in SCRIPT["scenes"]}
CHAR_IDS = sorted({l[0] for s in SCRIPT["scenes"] for l in s["lines"]})
NAMES = {c: c.upper() for c in CHAR_IDS}
_palette = [(255, 209, 102), (147, 197, 253), (249, 168, 212), (167, 243, 208), (253, 186, 116)]
NAME_COL = {c: _palette[i % len(_palette)] for i, c in enumerate(CHAR_IDS)}

# ---------- packs ----------
def load_pack(cid):
    man = json.load(open(f"{PACKS}/{cid}/character.rigpop.json"))
    t = man["talk"]
    base = Image.open(f"{PACKS}/{cid}/{t['base']}").convert("RGBA")
    bb = base.getchannel("A").getbbox()
    poses = {"base": base}
    for p in ["wave", "point", "open", "thumbs"]:
        rel = (t.get("poses") or {}).get(p)
        poses[p] = Image.open(f"{PACKS}/{cid}/{rel}").convert("RGBA") if rel else base
    patches = {k: Image.open(f"{PACKS}/{cid}/{t['files'][k]}").convert("RGBA")
               for k in ["A", "O", "E", "blink"]}
    anchors = {}
    pa = t.get("poseAnchors") or {}
    for p in poses:
        if p in pa:
            anchors[p] = {"mouth": pa[p]["mouth"], "eyes": pa[p]["eyes"]}
        else:  # fallback: base patch rect centres for every pose (drifts!)
            A, O, E, B = (t["patches"][k] for k in ["A", "O", "E", "blink"])
            anchors[p] = {"mouth": [(A["x"] + O["x"] + E["x"]) / 3 + A["w"] / 2,
                                    (A["y"] + O["y"] + E["y"]) / 3 + A["h"] / 2],
                          "eyes": [B["x"] + B["w"] / 2, B["y"] + B["h"] / 2]}
    sizes = {k: [t["patches"][k]["w"], t["patches"][k]["h"]] for k in ["A", "O", "E", "blink"]}
    return {"poses": poses, "patches": patches, "anchors": anchors, "sizes": sizes,
            "bbox": bb, "fig_h": bb[3] - bb[1]}
PACK = {c: load_pack(c) for c in CHAR_IDS}

# ---------- TTS ----------
os.makedirs(f"{PROJECT}/audio", exist_ok=True)
LINES = []
for scene in SCRIPT["scenes"]:
    for speaker, pose, text in scene["lines"]:
        LINES.append((speaker, pose, text))
for i, (speaker, pose, text) in enumerate(list(LINES)):
    raw, wav = f"{PROJECT}/audio/l{i:02d}-raw.wav", f"{PROJECT}/audio/l{i:02d}.wav"
    if not os.path.exists(wav):
        v = VOICES[speaker]
        model = v["model"]
        if not model.endswith(".onnx"):
            model = os.path.join(PIPER_VOICES, model + ".onnx")
        subprocess.run([PIPER, "-m", model, "--length-scale", str(v.get("length", 1.0)),
                        "-f", raw], input=text.encode(), check=True, capture_output=True)
        f = v.get("pitch", 1.0)
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", raw,
                        "-af", f"asetrate=22050*{f},aresample={SR},atempo={1/f:.4f}",
                        "-ar", str(SR), "-ac", "1", wav], check=True)
    w = wave.open(wav); n = w.getnframes()
    samples = np.frombuffer(w.readframes(n), dtype=np.int16).astype(np.float32) / 32768.0
    w.close()
    LINES[i] = (speaker, pose, text, samples, n / SR)
STARTS, _t = [], TITLE_T
for (_, _, _, _, dur) in LINES:
    STARTS.append(_t); _t += dur + GAP
TOTAL = _t + END_T
print(f"total {TOTAL:.1f}s, {len(LINES)} lines", flush=True)
for i, sh in enumerate(SHOTS):
    sh["start"] = STARTS[sh["lines"][0]] if i else TITLE_T
    sh["end"] = STARTS[SHOTS[i + 1]["lines"][0]] if i + 1 < len(SHOTS) else TOTAL - END_T

BGS = {}
for s in SCRIPT["scenes"]:
    if s["id"] not in BGS:
        BGS[s["id"]] = Image.open(f"{PROJECT}/assets/{s['bg']}").convert("RGB").resize((W, H), Image.LANCZOS)

_cache = {}
def scaled(img, k, key):
    kk = (key, round(k * 200))
    if kk not in _cache:
        _cache[kk] = img.resize((max(1, round(img.width * k)), max(1, round(img.height * k))), Image.LANCZOS)
    return _cache[kk]

def placement(cid, scene):
    """(k, bbox_cx, bbox_bottom) for a char at its scene mark."""
    _, _, mh = MARKS[scene][cid]
    pk = PACK[cid]
    return mh / pk["fig_h"], (pk["bbox"][0] + pk["bbox"][2]) / 2, pk["bbox"][3]

def face_point(cid, scene):
    fx, fy, _ = MARKS[scene][cid]
    k, bcx, bbot = placement(cid, scene)
    ex, ey = PACK[cid]["anchors"]["base"]["eyes"]
    return (fx - bcx * k + ex * k, fy - bbot * k + ey * k)

def cam_at(shot, tnow):
    cam = shot["cam"]
    p = (tnow - shot["start"]) / max(0.01, shot["end"] - shot["start"])
    p = p * p * (3 - 2 * p)
    if cam[0] == "closeup":
        _, cid, z0, z1 = cam
        cx, cy = face_point(cid, shot["bg"])
        return cx, cy - 6, z0 + (z1 - z0) * p
    if cam[0] == "two":
        _, a, b, z0, z1 = cam
        ax, ay = face_point(a, shot["bg"]); bx, by = face_point(b, shot["bg"])
        return (ax + bx) / 2, (ay + by) / 2 - 4, z0 + (z1 - z0) * p
    cx0, cy0, z0, cx1, cy1, z1 = cam
    return cx0 + (cx1 - cx0) * p, cy0 + (cy1 - cy0) * p, z0 + (z1 - z0) * p

def envelope(samples, dur):
    nf = max(1, int(dur * FPS)); per = max(1, len(samples) // nf)
    rms = np.array([np.sqrt(np.mean(samples[i * per:(i + 1) * per] ** 2) + 1e-9) for i in range(nf)])
    mx = rms.max() if rms.max() > 0 else 1.0
    seq, block = [], "E"
    rng = random.Random(500)
    for i, r in enumerate(rms):
        rel = r / mx
        if rel < 0.10: seq.append(None)
        elif rel > 0.52: seq.append("A")
        elif rel > 0.24:
            if i % 3 == 0: block = rng.choice(["E", "E", "O"])
            seq.append(block)
        else: seq.append("E")
    return seq
ENVS = [envelope(s, d) for (_, _, _, s, d) in LINES]
GEST = ["point", "base", "open", "thumbs", "base", "wave"]
def phrase_poses(text, scripted, dur):
    parts = [p for p in re.split(r"(?<=[.!?,;:])\s+", text.strip()) if p]
    counts = [max(1, len(p.split())) for p in parts]
    bounds, acc, tot = [], 0, sum(counts)
    for c in counts[:-1]:
        acc += c; bounds.append(acc / tot)
    if not bounds and dur > 3.2: bounds = [0.55]
    seq, cur, gi = [scripted], scripted, 0
    for _ in bounds:
        while GEST[gi % len(GEST)] == cur: gi += 1
        cur = GEST[gi % len(GEST)]; gi += 1
        seq.append(cur)
    return bounds, seq
PHRASES = [phrase_poses(tx, pz, d) for (_, pz, tx, _, d) in LINES]

def music_track(total):
    n = int(total * SR); out = np.zeros(n, dtype=np.float32)
    notes = [261.63, 329.63, 392.0, 440.0, 392.0, 329.63, 293.66, 329.63]
    beat = 0.46
    for i in range(int(total / beat)):
        f = notes[i % len(notes)]; st = int(i * beat * SR); ln = int(0.42 * SR)
        if st + ln > n: break
        seg = np.arange(ln) / SR
        out[st:st + ln] += 0.16 * np.sin(2 * np.pi * f * seg) * np.exp(-seg * 7) \
                         + 0.05 * np.sin(4 * np.pi * f * seg) * np.exp(-seg * 11)
        if i % 4 == 0:
            lnb = int(1.6 * SR)
            if st + lnb <= n:
                segb = np.arange(lnb) / SR
                out[st:st + lnb] += 0.07 * np.sin(2 * np.pi * f / 2 * segb) * np.exp(-segb * 2.2)
    fade = int(1.2 * SR)
    out[:fade] *= np.linspace(0, 1, fade); out[-fade:] *= np.linspace(1, 0, fade)
    return out
audio = music_track(TOTAL) * 0.9
for i, (_, _, _, samples, _) in enumerate(LINES):
    st = int(STARTS[i] * SR)
    audio[st:st + len(samples)] += samples * 0.95
audio = np.clip(audio, -1, 1)
w = wave.open(f"{PROJECT}/audio/full.wav", "wb"); w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
w.writeframes((audio * 32767).astype(np.int16).tobytes()); w.close()

blink_next = {c: random.uniform(0.8, 3.0) for c in CHAR_IDS}
f_title = ImageFont.truetype(FONT_B, 110); f_sub = ImageFont.truetype(FONT_B, 46)
f_cap = ImageFont.truetype(FONT_B, 42); f_name = ImageFont.truetype(FONT_B, 30)
black = Image.new("RGB", (W, H), (10, 10, 16))

def active_line(tnow):
    for i in range(len(LINES)):
        if STARTS[i] <= tnow < STARTS[i] + LINES[i][4]: return i
    return None

def char_pose(shot, cid, tnow, li):
    for (rl, chars, rp) in shot.get("react", []):
        if cid in chars:
            lend = STARTS[rl] + LINES[rl][4]
            if lend - 0.7 <= tnow <= lend + 0.2: return rp
    if li is not None and LINES[li][0] == cid:
        bounds, seq = PHRASES[li]
        lt = (tnow - STARTS[li]) / LINES[li][4]
        return seq[min(sum(1 for b in bounds if lt >= b), len(seq) - 1)]
    return "base"

def draw_char(stage, shot, cid, spec, tnow, li):
    scene = shot["bg"]
    mx, my, mh = MARKS[scene][cid]
    fx, walking = mx, False
    if spec and "enter" in spec:
        from_x, delay, dur = spec["enter"]
        p = (tnow - shot["start"] - delay) / dur
        if p < 1.0:
            walking = p > 0.0
            pp = max(0.0, p); pp = pp * pp * (3 - 2 * pp)
            fx = from_x + (mx - from_x) * pp
    pk = PACK[cid]
    k, bcx, bbot = placement(cid, scene)
    pose = char_pose(shot, cid, tnow, li)
    img = scaled(pk["poses"][pose], k, f"{cid}{pose}")
    bob = math.sin(tnow * 1.7 + mx) * 2.5
    if walking:
        bob = abs(math.sin(tnow * 9.0)) * 6.0
        img = img.rotate(math.sin(tnow * 9.0) * 2.2, resample=Image.BICUBIC,
                         center=(img.width // 2, img.height - 30))
    tlx = fx - bcx * k; tly = my - bbot * k - bob
    stage.alpha_composite(img, (round(tlx), round(tly)))
    anch = pk["anchors"][pose]
    if li is not None and LINES[li][0] == cid:
        fi = min(len(ENVS[li]) - 1, int((tnow - STARTS[li]) * FPS))
        mk = ENVS[li][fi] if fi >= 0 else None
        if mk:
            pw, ph = pk["sizes"][mk]
            pim = scaled(pk["patches"][mk], k, f"{cid}{mk}")
            stage.alpha_composite(pim, (round(tlx + (anch["mouth"][0] - pw / 2) * k),
                                        round(tly + (anch["mouth"][1] - ph / 2) * k)))
    if blink_next[cid] <= tnow <= blink_next[cid] + 0.13:
        pw, ph = pk["sizes"]["blink"]
        pim = scaled(pk["patches"]["blink"], k, f"{cid}blink")
        stage.alpha_composite(pim, (round(tlx + (anch["eyes"][0] - pw / 2) * k),
                                    round(tly + (anch["eyes"][1] - ph / 2) * k)))
    if tnow > blink_next[cid] + 0.13:
        blink_next[cid] = tnow + random.uniform(2.3, 4.1)

def caption(img, speaker, text):
    d = ImageDraw.Draw(img, "RGBA")
    wrap = textwrap.wrap(text, width=58)[:2]
    box_h = len(wrap) * 52 + 56
    x0, y0, x1, y1 = 240, H - box_h - 18, W - 240, H - 18
    d.rounded_rectangle([x0, y0, x1, y1], 26, fill=(12, 14, 24, 205))
    d.text((x0 + 36, y0 + 10), NAMES[speaker], font=f_name, fill=NAME_COL[speaker])
    for i, ln in enumerate(wrap):
        tw = d.textlength(ln, font=f_cap)
        d.text(((W - tw) / 2, y0 + 44 + i * 52), ln, font=f_cap, fill=(255, 255, 255))
    return img

def card(bg_img, big, small, tnow, t0, t1):
    img = bg_img.copy()
    ov = Image.new("RGBA", (W, H), (8, 10, 26, 118)); img = Image.alpha_composite(img.convert("RGBA"), ov)
    d = ImageDraw.Draw(img)
    tw = d.textlength(big, font=f_title)
    d.text(((W - tw) / 2, 400), big, font=f_title, fill=(255, 241, 205), stroke_width=3, stroke_fill=(23, 37, 189))
    sw = d.textlength(small, font=f_sub)
    d.text(((W - sw) / 2, 545), small, font=f_sub, fill=(255, 209, 102))
    fade = max(0.0, min(1.0, (tnow - t0) / 0.3, (t1 - tnow) / 0.3 + 0.001))
    return Image.blend(black, img.convert("RGB"), fade)

def frame(tnow):
    if tnow < TITLE_T:
        return card(BGS[SCRIPT["scenes"][0]["id"]], SCRIPT["title"], SCRIPT.get("subtitle", ""), tnow, 0, TITLE_T)
    if tnow >= TOTAL - END_T:
        return card(BGS[SCRIPT["scenes"][-1]["id"]], "THE END",
                    "Made with rigpop-forge", tnow, TOTAL - END_T, TOTAL)
    shot = next(s for s in SHOTS if s["start"] <= tnow < s["end"])
    li = active_line(tnow)
    stage = BGS[shot["bg"]].convert("RGBA")
    for cid, spec in sorted(shot["cast"].items(), key=lambda kv: MARKS[shot["bg"]][kv[0]][1]):
        draw_char(stage, shot, cid, spec, tnow, li)
    cx, cy, z = cam_at(shot, tnow)
    cw, ch = W / z, H / z
    x0 = min(max(cx - cw / 2, 0), W - cw); y0 = min(max(cy - ch / 2, 0), H - ch)
    img = stage.crop((round(x0), round(y0), round(x0 + cw), round(y0 + ch))).resize((W, H), Image.LANCZOS).convert("RGB")
    if li is not None:
        img = caption(img, LINES[li][0], LINES[li][2])
    return img

def main():
    nframes = int(TOTAL * FPS)
    silent = f"{PROJECT}/video-silent.mp4"
    proc = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo",
                             "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                             "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "19",
                             "-pix_fmt", "yuv420p", silent], stdin=subprocess.PIPE)
    for i in range(nframes):
        proc.stdin.write(frame(i / FPS).tobytes())
        if i % 480 == 0: print(f"frame {i}/{nframes}", flush=True)
    proc.stdin.close(); proc.wait()
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", silent,
                    "-i", f"{PROJECT}/audio/full.wav", "-c:v", "copy", "-c:a", "aac",
                    "-b:a", "160k", "-shortest", OUT], check=True)
    print("DONE", OUT, flush=True)

if __name__ == "__main__":
    main()
