#!/usr/bin/env python3
"""Generate Zola Markdown pages for videos, streams and playlists from .cache/."""

import datetime
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / ".cache"
CONTENT = ROOT / "content"
PARAGRAPH_SECONDS = 60


def toml(value):
    # JSON strings, numbers, arrays and booleans are valid TOML values.
    return json.dumps(value, ensure_ascii=False)


def seconds(stamp):
    h, m, s = stamp.split(":")
    return int(h) * 3600 + int(m) * 60 + float(s)


def timestamp(t):
    t = int(t)
    h, m, s = t // 3600, t // 60 % 60, t % 60
    return f"{h}:{m:02}:{s:02}" if h else f"{m}:{s:02}"


def parse_vtt(text):
    """Return (start_seconds, line) pairs, without the repeats of rolling captions.

    >>> parse_vtt('''WEBVTT
    ...
    ... 00:00:00.080 --> 00:00:03.909 align:start position:0%
    ...
    ... I<00:00:00.320><c> know</c>
    ...
    ... 00:00:03.909 --> 00:00:03.919 align:start position:0%
    ... I know
    ...
    ... 00:00:03.919 --> 00:00:06.070 align:start position:0%
    ... I know
    ... you&#39;re<00:00:04.240><c> here &amp; there</c>
    ... ''')
    [(0.08, 'I know'), (3.919, "you're here & there")]
    """
    lines, recent, start = [], [], None
    for raw in text.splitlines():
        match = re.match(r"(\d+:\d\d:\d\d\.\d+) -->", raw)
        if match:
            start = seconds(match.group(1))
            continue
        line = re.sub(r"<[^>]+>", "", raw).strip()
        line = line.replace("&amp;", "&").replace("&#39;", "'").replace("&quot;", '"')
        line = line.replace("&lt;", "<").replace("&gt;", ">").replace("&nbsp;", " ")
        if start is not None and line and line not in recent:
            lines.append((start, line))
            recent = (recent + [line])[-3:]
    return lines


def escape_markdown(text):
    return re.sub(r"([\\`*_<])", r"\\\1", text)


def subtitle_file(info):
    vid = info["id"]
    manual = [lang for lang in info.get("subtitles", {}) if lang == "en" or lang.startswith("en-")]
    for lang in manual + ["en-orig", "en"]:
        path = CACHE / "videos" / f"{vid}.{lang}.vtt"
        if path.exists():
            return path, lang in manual
    return None, False


def transcript(info):
    path, manual = subtitle_file(info)
    if not path:
        return ""
    chapters = info.get("chapters") or []
    out = ["## Transcript", ""]
    if not manual:
        out += ["This transcript comes from the automatic captions of YouTube.", ""]
    paragraph, start, chapter = [], None, 0

    def flush():
        if paragraph:
            url = f"https://www.youtube.com/watch?v={info['id']}&t={int(start)}s"
            out.extend([f"[{timestamp(start)}]({url}) " + escape_markdown(" ".join(paragraph)), ""])
            paragraph.clear()

    for t, line in parse_vtt(path.read_text(encoding="utf-8")):
        if chapter < len(chapters) and t >= chapters[chapter]["start_time"]:
            flush()
            while chapter < len(chapters) and t >= chapters[chapter]["start_time"]:
                chapter += 1
            out.extend([f"### {escape_markdown(chapters[chapter - 1]['title'])}", ""])
        if paragraph and t - start >= PARAGRAPH_SECONDS:
            flush()
        if not paragraph:
            start = t
        paragraph.append(line)
    flush()
    return "\n".join(out)


def video_page(info):
    date = datetime.datetime.fromtimestamp(info["timestamp"], datetime.timezone.utc)
    fetched = datetime.date.fromtimestamp(info["epoch"])
    chapters = [(int(c["start_time"]), c["title"]) for c in info.get("chapters") or []]
    front = [
        "+++",
        f"title = {toml(info['title'])}",
        f"date = {date.strftime('%Y-%m-%dT%H:%M:%SZ')}",
        "",
        "[extra]",
        f"id = {toml(info['id'])}",
        f"length = {toml(timestamp(info['duration']) if info.get('duration') else None)}",
        f"short = {toml(info.get('media_type') == 'short')}",
        f"availability = {toml(info.get('availability'))}",
        f"views = {toml(info.get('view_count'))}",
        f"likes = {toml(info.get('like_count'))}",
        f"comments = {toml(info.get('comment_count'))}",
        f"fetched = {fetched.isoformat()}",
        f"description = {toml(info.get('description') or '')}",
        "chapters = [",
        *(f"  {{ start = {t}, time = {toml(timestamp(t))}, title = {toml(title)} }}," for t, title in chapters),
        "]",
        "+++",
        "",
        "",
    ]
    # TOML has no null, so drop keys that YouTube did not give.
    front = [line for line in front if not line.endswith("= null")]
    return "\n".join(front) + transcript(info)


def playlist_page(data):
    entries = [{"id": e["id"], "title": e.get("title") or e["id"]} for e in data.get("entries") or []]
    return "\n".join(
        [
            "+++",
            f"title = {toml(data['title'])}",
            "",
            "[extra]",
            f"id = {toml(data['id'])}",
            f"description = {toml(data.get('description') or '')}",
            "videos = [",
            *(f"  {{ id = {toml(e['id'])}, title = {toml(e['title'])} }}," for e in entries),
            "]",
            "+++",
            "",
        ]
    )


def write(path, text):
    text = text.rstrip("\n") + "\n"
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists() or path.read_text(encoding="utf-8") != text:
        path.write_text(text, encoding="utf-8")


def main():
    for path in sorted((CACHE / "videos").glob("*.info.json")):
        info = json.loads(path.read_text(encoding="utf-8"))
        if info.get("live_status") in ("is_live", "is_upcoming"):
            continue
        section = "streams" if info.get("live_status") == "was_live" or info.get("was_live") else "videos"
        write(CONTENT / section / f"{info['id']}.md", video_page(info))
    for path in sorted((CACHE / "playlists").glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        write(CONTENT / "playlists" / f"{data['id']}.md", playlist_page(data))


if __name__ == "__main__":
    main()
