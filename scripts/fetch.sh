#!/bin/sh
# Download metadata, English captions, playlists and thumbnails into .cache/ and static/, without the videos.
set -eu
cd "$(dirname "$0")/.."
mkdir -p .cache/videos .cache/playlists static/thumbs
channel=https://www.youtube.com/@SeafoamKitten

fetch_videos() {
	yt-dlp --skip-download --write-info-json --no-write-playlist-metafiles \
		--write-subs --write-auto-subs --sub-langs 'en.*,en' --sub-format vtt \
		--sleep-requests 1 --ignore-errors -o '.cache/videos/%(id)s.%(ext)s' "$@" || true
}

fetch_videos "$channel/videos" "$channel/streams" "$channel/shorts"

for id in $(yt-dlp --flat-playlist --print id "$channel/playlists"); do
	yt-dlp --flat-playlist -J "https://www.youtube.com/playlist?list=$id" >".cache/playlists/$id.json"
done

# Playlists can hold unlisted videos that the channel tabs do not show.
missing=$(python3 -I -c '
import json, pathlib
have = {p.name.split(".")[0] for p in pathlib.Path(".cache/videos").glob("*.info.json")}
for p in pathlib.Path(".cache/playlists").glob("*.json"):
    for e in json.loads(p.read_text())["entries"]:
        if e["id"] not in have and e.get("channel_id") in (None, "UCBRuxya3juxDB1SOg-QOBpg"):
            print("https://www.youtube.com/watch?v=" + e["id"])
' | sort -u)
[ -z "$missing" ] || fetch_videos $missing

for info in .cache/videos/*.info.json; do
	id=$(basename "$info" .info.json)
	[ -f "static/thumbs/$id.jpg" ] || curl -sfL -o "static/thumbs/$id.jpg" "https://i.ytimg.com/vi/$id/mqdefault.jpg" || true
done
