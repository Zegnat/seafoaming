// Generate Zola Markdown pages for videos, streams and playlists from .cache/.

const ROOT = new URL("..", import.meta.url).pathname;
const CACHE = `${ROOT}.cache`;
const CONTENT = `${ROOT}content`;
const PARAGRAPH_SECONDS = 60;
const VIDEO_SECTIONS = ["videos", "shorts", "streams"];

// deno-lint-ignore no-explicit-any
type Info = Record<string, any>;

// JSON strings, numbers, arrays and booleans are valid TOML values.
const toml = (value: unknown) => JSON.stringify(value ?? null);

function seconds(stamp: string) {
  const [h, m, s] = stamp.split(":");
  return Number(h) * 3600 + Number(m) * 60 + Number(s);
}

export function timestamp(t: number) {
  t = Math.trunc(t);
  const h = Math.trunc(t / 3600), m = Math.trunc(t / 60) % 60, s = t % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

// Return [start seconds, line] pairs, without the repeats of rolling captions.
export function parseVtt(text: string) {
  const lines: [number, string][] = [];
  let recent: string[] = [];
  let start: number | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const match = raw.match(/^(\d+:\d\d:\d\d\.\d+) -->/);
    if (match) {
      start = seconds(match[1]);
      continue;
    }
    const line = raw.replace(/<[^>]+>/g, "").trim()
      .replaceAll("&amp;", "&").replaceAll("&#39;", "'").replaceAll("&quot;", '"')
      .replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&nbsp;", " ").replace(/\s+/g, " ");
    if (start !== null && line && !recent.includes(line)) {
      lines.push([start, line]);
      recent = [...recent, line].slice(-3);
    }
  }
  return lines;
}

const escapeMarkdown = (text: string) => text.replace(/([\\`*_<])/g, "\\$1");

function exists(path: string) {
  try {
    Deno.statSync(path);
    return true;
  } catch {
    return false;
  }
}

function subtitleFile(info: Info): [string | null, boolean] {
  const manual = Object.keys(info.subtitles ?? {}).filter((lang) => lang === "en" || lang.startsWith("en-"));
  // The automatic "en" track is a machine translation when YouTube recognized the speech in another language.
  const automatic = info.language?.startsWith("en") ? ["en-orig", "en"] : ["en-orig"];
  for (const lang of [...manual, ...automatic]) {
    const path = `${CACHE}/videos/${info.id}.${lang}.vtt`;
    if (exists(path)) return [path, manual.includes(lang)];
  }
  return [null, false];
}

function transcript(info: Info) {
  const [path, manual] = subtitleFile(info);
  if (!path) {
    const other = Object.keys(info.automatic_captions ?? {}).find((lang) => lang.endsWith("-orig"));
    return [
      "## Transcript",
      "",
      other
        ? `YouTube only has automatic captions in another language (${other.slice(0, -5)}) for this video. ` +
          "They are a machine translation of wrongly recognized speech, so the wiki does not show them."
        : "YouTube has no captions for this video, so the wiki has no transcript of it yet.",
      "",
    ].join("\n");
  }
  const chapters = info.chapters ?? [];
  const out = ["## Transcript", ""];
  if (!manual) out.push("This transcript comes from the automatic captions of YouTube.", "");
  const paragraph: string[] = [];
  let start = 0, chapter = 0;

  const flush = () => {
    if (!paragraph.length) return;
    const url = `https://www.youtube.com/watch?v=${info.id}&t=${Math.trunc(start)}s`;
    out.push(`[${timestamp(start)}](${url}) ` + escapeMarkdown(paragraph.join(" ")), "");
    paragraph.length = 0;
  };

  for (const [t, line] of parseVtt(Deno.readTextFileSync(path))) {
    if (chapter < chapters.length && t >= chapters[chapter].start_time) {
      flush();
      while (chapter < chapters.length && t >= chapters[chapter].start_time) chapter++;
      out.push(`### ${escapeMarkdown(chapters[chapter - 1].title.replace(/\s+/g, " ").trim())}`, "");
    }
    if (paragraph.length && t - start >= PARAGRAPH_SECONDS) flush();
    if (!paragraph.length) start = t;
    paragraph.push(line);
  }
  flush();
  return out.join("\n");
}

// Turn the error message of YouTube into a status. Age checks are not errors: the video is still there.
export function classify(message: string) {
  if (/confirm your age/i.test(message)) return null;
  if (/members|join this channel/i.test(message)) return { status: "members-only", by: null };
  if (/private/i.test(message)) return { status: "private", by: null };
  if (/removed by the uploader/i.test(message)) return { status: "removed", by: "uploader" };
  if (/violating|terms of service|copyright|terminated/i.test(message)) return { status: "removed", by: "YouTube" };
  return { status: "unavailable", by: null };
}

function readStatus(id: string) {
  const file = `${CACHE}/status/${id}.json`;
  if (!exists(file)) return null;
  const { message, checked } = JSON.parse(Deno.readTextFileSync(file));
  const result = classify(message);
  return result && { ...result, message, checked };
}

function videoPage(info: Info, placeholder: string | null) {
  const gone = readStatus(info.id);
  const status = gone?.status ??
    ({ unlisted: "unlisted", subscriber_only: "members-only" } as Record<string, string>)[info.availability] ?? null;
  const date = new Date(info.timestamp * 1000).toISOString().replace(/\.\d+Z$/, "Z");
  const fetched = new Date(info.epoch * 1000).toISOString().slice(0, 10);
  const chapters: Info[] = info.chapters ?? [];
  const front = [
    "+++",
    `title = ${toml(info.title)}`,
    `date = ${date}`,
    "",
    "[extra]",
    `id = ${toml(info.id)}`,
    `duration = ${toml(info.duration)}`,
    `length = ${toml(info.duration ? timestamp(info.duration) : null)}`,
    `availability = ${toml(info.availability)}`,
    `status = ${toml(status)}`,
    `removed_by = ${toml(gone?.by)}`,
    `status_message = ${toml(gone?.message)}`,
    `status_checked = ${gone?.checked ?? "null"}`,
    `age_restricted = ${toml(info.age_limit >= 18)}`,
    `placeholder = ${toml(placeholder)}`,
    `views = ${toml(info.view_count)}`,
    `likes = ${toml(info.like_count)}`,
    `comments = ${toml(info.comment_count)}`,
    // yt-dlp gives no comment count when the comments are turned off.
    `comments_off = ${toml(info.comment_count == null)}`,
    `fetched = ${fetched}`,
    `description = ${toml(info.description || "")}`,
    "chapters = [",
    ...chapters.map((c) => {
      const t = Math.trunc(c.start_time);
      return `  { start = ${t}, time = ${toml(timestamp(t))}, title = ${toml(c.title)} },`;
    }),
    "]",
    "+++",
    "",
    "",
  ];
  // TOML has no null, so drop keys that YouTube did not give.
  return front.filter((line) => !line.endsWith("= null")).join("\n") + transcript(info);
}

function playlistPage(data: Info) {
  const entries: Info[] = data.entries ?? [];
  // The playlist thumbnail is the thumbnail of one of its videos. The stack puts it on top of the next two.
  const thumbnail = data.thumbnails?.[0]?.url?.match(/\/vi\/([^/]+)\//)?.[1];
  const stack = [...new Set([thumbnail, ...entries.map((e) => e.id)])]
    .filter((id) => id && exists(`${ROOT}static/thumbs/${id}-320.webp`)).slice(0, 3);
  return [
    "+++",
    `title = ${toml(data.title)}`,
    "",
    "[extra]",
    `id = ${toml(data.id)}`,
    `stack = ${toml(stack)}`,
    `views = ${toml(data.view_count)}`,
    `updated = ${data.modified_date ? data.modified_date.replace(/(\d{4})(\d\d)(\d\d)/, "$1-$2-$3") : "null"}`,
    `fetched = ${new Date(data.epoch * 1000).toISOString().slice(0, 10)}`,
    `description = ${toml(data.description || "")}`,
    "videos = [",
    ...entries.map((e) => {
      const status = readStatus(e.id)?.status;
      return `  { id = ${toml(e.id)}, title = ${toml(e.title || e.id)}${status ? `, status = ${toml(status)}` : ""} },`;
    }),
    "]",
    "+++",
    "",
  ].filter((line) => !line.endsWith("= null")).join("\n");
}

function write(path: string, text: string) {
  text = text.replace(/\n*$/, "\n");
  Deno.mkdirSync(path.slice(0, path.lastIndexOf("/")), { recursive: true });
  if (!exists(path) || Deno.readTextFileSync(path) !== text) Deno.writeTextFileSync(path, text);
}

function* jsonFiles(dir: string, suffix: string) {
  const names = [...Deno.readDirSync(dir)].map((e) => e.name).filter((n) => n.endsWith(suffix)).sort();
  for (const name of names) yield JSON.parse(Deno.readTextFileSync(`${dir}/${name}`));
}

if (import.meta.main) {
  // Loaded here, so the tests do not need sharp.
  const { thumbnail } = await import("./images.ts");
  for (const info of jsonFiles(`${CACHE}/videos`, ".info.json")) {
    if (["is_live", "is_upcoming"].includes(info.live_status)) continue;
    const section = info.live_status === "was_live" || info.was_live
      ? "streams"
      : info.media_type === "short"
      ? "shorts"
      : "videos";
    write(`${CONTENT}/${section}/${info.id}.md`, videoPage(info, await thumbnail(info.id)));
    // A video can move to another section, for example when YouTube marks it as a short later.
    for (const other of VIDEO_SECTIONS.filter((s) => s !== section)) {
      if (exists(`${CONTENT}/${other}/${info.id}.md`)) Deno.removeSync(`${CONTENT}/${other}/${info.id}.md`);
    }
  }
  for (const data of jsonFiles(`${CACHE}/playlists`, ".json")) {
    write(`${CONTENT}/playlists/${data.id}.md`, playlistPage(data));
  }
}
