#!/usr/bin/env python3
"""Echelon library captions: Whisper on the GitHub runner, a VTT per video.

Run by .github/workflows/captions.yml every 15 minutes. Rows in library_videos
with captions_status = 'queued' (set by trigger trg_captions_queue on insert, or
by the admin Captions button) are taken in order: download the file from the
private lesson-files bucket, pull a 16 kHz mono track with ffmpeg, transcribe
with faster-whisper (small.en, int8 on CPU), re-chunk the word timestamps into
short readable cues, and upload library/<folder>/captions.vtt. The row then
carries captions_path and status 'ready'; media-url signs the VTT alongside
the video and the app's CC button lights up.

Env: SUPABASE_SERVICE_ROLE_KEY (required), WHISPER_MODEL (default small.en),
CAPTIONS_BUDGET_MIN (default 300: stop taking new rows after this long).
"""
import json
import math
import os
import re
import subprocess
import tempfile
import time
import urllib.parse
import urllib.request

SB = "https://cqdignbleethroyxxvzr.supabase.co"
KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
MODEL = os.environ.get("WHISPER_MODEL", "small.en")
BUDGET = int(os.environ.get("CAPTIONS_BUDGET_MIN", "300")) * 60
MAX_CHARS = 42   # two short lines on a phone, one on a desktop
MAX_SECS = 6.0   # a cue longer than this reads as a wall of text
MIN_SECS = 0.6   # shorter than this and the cue flickers
JOIN_GAP = 0.3   # cues closer than this butt up so the box never blinks off
PAUSE = 1.0      # a silence this long ends a sentence even without a full stop
# steers the model toward the words that come up in every session
VOCAB = ("Echelon, D1, NQ, ES, MNQ, GEX, gamma, delta, VWAP, order flow, FVG, "
         "liquidity, sweep, displacement, reclaim, premarket, New York open, "
         "gamma flip, prop firm, TradingView.")


def api(method, path, body=None, headers=None):
    h = {"apikey": KEY, "Authorization": f"Bearer {KEY}"}
    if headers:
        h.update(headers)
    data = None
    if body is not None:
        if isinstance(body, (bytes, bytearray)):
            data = bytes(body)
        else:
            data = json.dumps(body).encode()
            h["Content-Type"] = "application/json"
    req = urllib.request.Request(SB + path, data=data, method=method, headers=h)
    with urllib.request.urlopen(req, timeout=600) as r:
        out = r.read()
    return json.loads(out) if out else None


def patch(vid, fields):
    api("PATCH", f"/rest/v1/library_videos?id=eq.{vid}", fields, {"Prefer": "return=minimal"})


def download(path, dest):
    url = f"{SB}/storage/v1/object/authenticated/lesson-files/{urllib.parse.quote(path)}"
    req = urllib.request.Request(url, headers={"apikey": KEY, "Authorization": f"Bearer {KEY}"})
    with urllib.request.urlopen(req, timeout=1800) as r, open(dest, "wb") as f:
        while True:
            chunk = r.read(1 << 20)
            if not chunk:
                break
            f.write(chunk)


def ts(s):
    h = int(s // 3600)
    m = int(s % 3600 // 60)
    return f"{h:02d}:{m:02d}:{s % 60:06.3f}"


def text_of(ws):
    return " ".join(t for _, _, t in ws)


def pack(ws):
    """One sentence into as few cues as fit MAX_CHARS and MAX_SECS, balanced
    so the pieces are about the same length instead of a long line followed
    by a two-word orphan."""
    total = len(text_of(ws))
    n = max(1, math.ceil(total / MAX_CHARS), math.ceil((ws[-1][1] - ws[0][0]) / MAX_SECS))
    target = total / n
    out, cur = [], []
    for w in ws:
        if cur:
            hard = len(text_of(cur)) + 1 + len(w[2]) > MAX_CHARS or w[1] - cur[0][0] > MAX_SECS
            soft = len(out) < n - 1 and len(text_of(cur)) >= target
            if hard or soft:
                out.append(cur)
                cur = []
        cur.append(w)
    if cur:
        out.append(cur)
    return [(c[0][0], c[-1][1], text_of(c)) for c in out]


def cues_from(segments):
    """Word timestamps into captions. Words are grouped into sentences first
    (a full stop, or a pause longer than PAUSE), then each sentence is packed
    into balanced cues, so a cue never starts mid-phrase when it can help it."""
    words = [(w.start, w.end, w.word.strip())
             for seg in segments for w in (seg.words or []) if w.word.strip()]
    sentences, cur = [], []
    for st, en, t in words:
        if cur and st - cur[-1][1] > PAUSE:
            sentences.append(cur)
            cur = []
        cur.append((st, en, t))
        if re.search(r"[.!?]$", t):
            sentences.append(cur)
            cur = []
    if cur:
        sentences.append(cur)
    # a pause can strand one or two words: a tail ("... August" / "28th.")
    # goes back to the sentence it belongs to, a lead-in ("Now," / "So")
    # joins the sentence it opens
    merged = []
    for s in sentences:
        if merged and len(s) < 3 and not re.search(r"[.!?]$", merged[-1][-1][2]):
            merged[-1] = merged[-1] + s
        elif merged and len(merged[-1]) < 3 and not re.search(r"[.!?]$", merged[-1][-1][2]):
            merged[-1] = merged[-1] + s
        else:
            merged.append(s)
    cues = []
    for s in merged:
        cues.extend(pack(s))
    return cues


def vtt(cues):
    out = ["WEBVTT", ""]
    for i, (st, en, txt) in enumerate(cues, 1):
        nxt = cues[i][0] if i < len(cues) else None
        en = max(en, st + MIN_SECS)
        if nxt is not None:
            if nxt - en < JOIN_GAP:   # close together: hold this cue until the next one
                en = nxt
            en = min(en, nxt)          # never overlap the next cue
        out += [str(i), f"{ts(st)} --> {ts(en)}", txt, ""]
    return "\n".join(out)


def main():
    from faster_whisper import WhisperModel
    t0 = time.time()
    rows = api("GET", "/rest/v1/library_videos?select=id,title,storage_path&captions_status=eq.queued&order=created_at")
    if not rows:
        print("nothing queued")
        return
    model = None
    for r in rows:
        if time.time() - t0 > BUDGET:
            print("out of time; the rest waits for the next run")
            break
        print(f"== {r['title']} ({r['id']})", flush=True)
        patch(r["id"], {"captions_status": "working", "captions_error": None})
        try:
            with tempfile.TemporaryDirectory() as d:
                src, wav = os.path.join(d, "video"), os.path.join(d, "audio.wav")
                download(r["storage_path"], src)
                print(f"   downloaded {os.path.getsize(src) / 1048576:.0f} MB", flush=True)
                subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", src, "-vn", "-ac", "1", "-ar", "16000", wav], check=True)
                if model is None:
                    model = WhisperModel(MODEL, device="cpu", compute_type="int8")
                segments, info = model.transcribe(wav, language="en", word_timestamps=True,
                                                  vad_filter=True, initial_prompt=VOCAB, beam_size=5)
                cues = cues_from(segments)
                if not cues:
                    raise RuntimeError("no speech found in the video")
                path = r["storage_path"].rsplit("/", 1)[0] + "/captions.vtt"
                api("POST", f"/storage/v1/object/lesson-files/{urllib.parse.quote(path)}",
                    vtt(cues).encode(), {"Content-Type": "text/vtt", "x-upsert": "true"})
                patch(r["id"], {"captions_path": path, "captions_status": "ready", "captions_error": None,
                                "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())})
                print(f"   ready: {len(cues)} cues from {info.duration / 60:.1f} min of audio, "
                      f"{time.time() - t0:.0f}s into the run", flush=True)
        except Exception as e:  # one bad video must not block the queue
            print(f"   failed: {e}", flush=True)
            patch(r["id"], {"captions_status": "failed", "captions_error": str(e)[:300]})


if __name__ == "__main__":
    main()
