// Download metadata, English captions, playlists and thumbnails into .cache/ and static/, without the videos.

const ROOT = new URL("..", import.meta.url).pathname;
const CHANNEL = "https://www.youtube.com/@SeafoamKitten";
const CHANNEL_ID = "UCBRuxya3juxDB1SOg-QOBpg";
Deno.chdir(ROOT);
for (const dir of [".cache/videos", ".cache/playlists", "static/thumbs"]) Deno.mkdirSync(dir, { recursive: true });

async function ytDlp(args: string[], inherit = true) {
  const { stdout } = await new Deno.Command("yt-dlp", { args, stdout: inherit ? "inherit" : "piped" }).output();
  return inherit ? "" : new TextDecoder().decode(stdout);
}

// yt-dlp exits with an error when one video fails, so the result is ignored.
const fetchVideos = (urls: string[]) =>
  ytDlp([
    "--skip-download",
    "--write-info-json",
    "--no-write-playlist-metafiles",
    "--write-subs",
    "--write-auto-subs",
    "--sub-langs",
    "en.*,en",
    "--sub-format",
    "vtt",
    "--sleep-requests",
    "1",
    "--ignore-errors",
    "-o",
    ".cache/videos/%(id)s.%(ext)s",
    ...urls,
  ]);

const ids = (dir: string, suffix: string) =>
  new Set(
    [...Deno.readDirSync(dir)].filter((e) => e.name.endsWith(suffix)).map((e) => e.name.slice(0, -suffix.length)),
  );

await fetchVideos([`${CHANNEL}/videos`, `${CHANNEL}/streams`, `${CHANNEL}/shorts`]);

const playlists = (await ytDlp(["--flat-playlist", "--print", "id", `${CHANNEL}/playlists`], false)).split("\n").filter(
  Boolean,
);
for (const id of playlists) {
  const json = await ytDlp(["--flat-playlist", "-J", `https://www.youtube.com/playlist?list=${id}`], false);
  if (json) Deno.writeTextFileSync(`.cache/playlists/${id}.json`, json);
}

// Playlists can hold unlisted videos that the channel tabs do not show.
const have = ids(".cache/videos", ".info.json");
const missing = new Set<string>();
for (const id of ids(".cache/playlists", ".json")) {
  for (const e of JSON.parse(Deno.readTextFileSync(`.cache/playlists/${id}.json`)).entries ?? []) {
    if (!have.has(e.id) && [undefined, null, CHANNEL_ID].includes(e.channel_id)) missing.add(e.id);
  }
}
if (missing.size) await fetchVideos([...missing].map((id) => `https://www.youtube.com/watch?v=${id}`));

const thumbs = ids("static/thumbs", ".jpg");
for (const id of ids(".cache/videos", ".info.json")) {
  if (thumbs.has(id)) continue;
  const response = await fetch(`https://i.ytimg.com/vi/${id}/mqdefault.jpg`);
  if (response.ok) Deno.writeFileSync(`static/thumbs/${id}.jpg`, new Uint8Array(await response.arrayBuffer()));
  else await response.body?.cancel();
}
