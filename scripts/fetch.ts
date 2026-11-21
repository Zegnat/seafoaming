// Download metadata, English captions, playlists and thumbnails into .cache/ and static/, without the videos.

const ROOT = new URL("..", import.meta.url).pathname;
const CHANNEL = "https://www.youtube.com/@SeafoamKitten";
const CHANNEL_ID = "UCBRuxya3juxDB1SOg-QOBpg";
Deno.chdir(ROOT);
for (const dir of [".cache/videos", ".cache/playlists", ".cache/status", ".cache/thumbs"]) {
  Deno.mkdirSync(dir, { recursive: true });
}

// Run yt-dlp. Its errors go to the terminal and also come back to the caller.
async function ytDlp(args: string[], inherit = true) {
  const child = new Deno.Command("yt-dlp", { args, stdout: inherit ? "inherit" : "piped", stderr: "piped" }).spawn();
  const decoder = new TextDecoder();
  const readErrors = async () => {
    let errors = "";
    for await (const chunk of child.stderr) {
      await Deno.stderr.write(chunk);
      errors += decoder.decode(chunk, { stream: true });
    }
    return errors;
  };
  // Read both streams at the same time, or yt-dlp blocks when the stdout pipe is full.
  const [errors, stdout] = await Promise.all([
    readErrors(),
    inherit ? Promise.resolve("") : new Response(child.stdout).text(),
  ]);
  await child.status;
  return { stdout, errors };
}

const refresh = Deno.args.includes("--refresh");
// Other arguments go to yt-dlp, for example --cookies-from-browser for age-restricted videos.
const extra = Deno.args.filter((arg) => arg !== "--refresh");
const lines = async (args: string[]) => (await ytDlp(args, false)).stdout.split("\n").filter(Boolean);
const ids = (dir: string, suffix: string) =>
  new Set(
    [...Deno.readDirSync(dir)].filter((e) => e.name.endsWith(suffix)).map((e) => e.name.slice(0, -suffix.length)),
  );

// The flat listings are cheap. Every full video request counts against the rate limit of YouTube.
const wanted = new Set(
  await lines(["--flat-playlist", "--print", "id", `${CHANNEL}/videos`, `${CHANNEL}/streams`, `${CHANNEL}/shorts`]),
);
// Videos that YouTube still lists normally. Playlists keep private and deleted videos under a placeholder title.
const listed = new Set(wanted);
for (const id of await lines(["--flat-playlist", "--print", "id", `${CHANNEL}/playlists`])) {
  const { stdout: json } = await ytDlp(["--flat-playlist", "-J", `https://www.youtube.com/playlist?list=${id}`], false);
  if (!json) continue;
  Deno.writeTextFileSync(`.cache/playlists/${id}.json`, json);
  // Playlists can hold unlisted videos that the channel tabs do not show.
  for (const e of JSON.parse(json).entries ?? []) {
    if (![undefined, null, CHANNEL_ID].includes(e.channel_id)) continue;
    wanted.add(e.id);
    if (!/^\[(Private|Deleted) video\]$/.test(e.title ?? "")) listed.add(e.id);
  }
}

// Without --refresh, only download videos that are not in the cache yet, and check again the cached videos
// that YouTube no longer lists normally, so their pages can show that they are gone.
const have = refresh ? new Set() : ids(".cache/videos", ".info.json");
const cached = ids(".cache/videos", ".info.json");
const todo = [...new Set([...wanted, ...cached])].filter((id) => !have.has(id) || !listed.has(id));
console.log(`Downloading ${todo.length} of ${wanted.size} videos.`);
// yt-dlp exits with an error when one video fails, so the result is ignored.
if (todo.length) {
  const { errors } = await ytDlp([
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
  // Save why a video failed. Rate limits are temporary, so they do not count.
  const failed = new Map(
    [...errors.matchAll(/^ERROR: \[youtube\] ([\w-]{11}): (.+)$/gm)].filter(([, , message]) =>
      !/try again later/i.test(message)
    )
      .map(([, id, message]) => [id, message.trim()]),
  );
  const checked = new Date().toISOString().slice(0, 10);
  const statuses = ids(".cache/status", ".json");
  for (const id of todo) {
    const file = `.cache/status/${id}.json`;
    if (failed.has(id)) {
      Deno.writeTextFileSync(file, JSON.stringify({ message: failed.get(id), checked }, null, 2) + "\n");
    } else if (statuses.has(id)) Deno.removeSync(file); // The video is back.
  }
}

// Download the best thumbnail that YouTube has, then three snapshots from the video for the hover preview.
// The originals stay in .cache/thumbs; the generator makes the smaller versions for the site.
// The 4:3 fallbacks have black bars that the generator cuts off.
const qualities = ["maxres", "sd", "hq", "mq"];
const variants = { "": "default", "-1": "1", "-2": "2", "-3": "3" };
const originals = ids(".cache/thumbs", ".jpg");
for (const id of ids(".cache/videos", ".info.json")) {
  for (const [suffix, name] of Object.entries(variants)) {
    if (originals.has(id + suffix)) continue;
    for (const quality of qualities) {
      const response = await fetch(`https://i.ytimg.com/vi/${id}/${quality}${name}.jpg`);
      if (!response.ok) {
        await response.body?.cancel();
        continue;
      }
      Deno.writeFileSync(`.cache/thumbs/${id}${suffix}.jpg`, new Uint8Array(await response.arrayBuffer()));
      break;
    }
  }
}
