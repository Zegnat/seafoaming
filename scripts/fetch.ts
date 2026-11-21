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

const refresh = Deno.args.includes("--refresh");
// Other arguments go to yt-dlp, for example --cookies-from-browser for age-restricted videos.
const extra = Deno.args.filter((arg) => arg !== "--refresh");
const lines = async (args: string[]) => (await ytDlp(args, false)).split("\n").filter(Boolean);
const ids = (dir: string, suffix: string) =>
  new Set(
    [...Deno.readDirSync(dir)].filter((e) => e.name.endsWith(suffix)).map((e) => e.name.slice(0, -suffix.length)),
  );

// The flat listings are cheap. Every full video request counts against the rate limit of YouTube.
const wanted = new Set(
  await lines(["--flat-playlist", "--print", "id", `${CHANNEL}/videos`, `${CHANNEL}/streams`, `${CHANNEL}/shorts`]),
);
for (const id of await lines(["--flat-playlist", "--print", "id", `${CHANNEL}/playlists`])) {
  const json = await ytDlp(["--flat-playlist", "-J", `https://www.youtube.com/playlist?list=${id}`], false);
  if (!json) continue;
  Deno.writeTextFileSync(`.cache/playlists/${id}.json`, json);
  // Playlists can hold unlisted videos that the channel tabs do not show.
  for (const e of JSON.parse(json).entries ?? []) {
    if ([undefined, null, CHANNEL_ID].includes(e.channel_id)) wanted.add(e.id);
  }
}

// Without --refresh, only download videos that are not in the cache yet.
const have = refresh ? new Set() : ids(".cache/videos", ".info.json");
const todo = [...wanted].filter((id) => !have.has(id));
console.log(`Downloading ${todo.length} of ${wanted.size} videos.`);
// yt-dlp exits with an error when one video fails, so the result is ignored.
if (todo.length) {
  await ytDlp([
    "--skip-download",
    "--write-info-json",
    "--write-subs",
    "--write-auto-subs",
    "--sub-langs",
    "en.*,en",
    "--sub-format",
    "vtt",
    "--preset-alias",
    "sleep",
    "--ignore-errors",
    ...extra,
    "-o",
    ".cache/videos/%(id)s.%(ext)s",
    ...todo.map((id) => `https://www.youtube.com/watch?v=${id}`),
  ]);
}

// The default thumbnail, then three snapshots from the video for the hover preview.
const thumbs = ids("static/thumbs", ".jpg");
const variants = { "": "mqdefault", "-1": "mq1", "-2": "mq2", "-3": "mq3" };
for (const id of ids(".cache/videos", ".info.json")) {
  for (const [suffix, name] of Object.entries(variants)) {
    if (thumbs.has(id + suffix)) continue;
    const response = await fetch(`https://i.ytimg.com/vi/${id}/${name}.jpg`);
    if (response.ok) {
      Deno.writeFileSync(`static/thumbs/${id}${suffix}.jpg`, new Uint8Array(await response.arrayBuffer()));
    } else await response.body?.cancel();
  }
}
