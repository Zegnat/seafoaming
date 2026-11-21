// Generate Zola Markdown pages for videos, streams and playlists from .cache/.

const ROOT = new URL("..", import.meta.url).pathname;
const CACHE = `${ROOT}.cache`;
const CONTENT = `${ROOT}content`;
const PARAGRAPH_SECONDS = 60;

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
      .replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&nbsp;", " ");
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
  for (const lang of [...manual, "en-orig", "en"]) {
    const path = `${CACHE}/videos/${info.id}.${lang}.vtt`;
    if (exists(path)) return [path, manual.includes(lang)];
  }
  return [null, false];
}

function transcript(info: Info) {
  const [path, manual] = subtitleFile(info);
  if (!path) return "";
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
      out.push(`### ${escapeMarkdown(chapters[chapter - 1].title)}`, "");
    }
    if (paragraph.length && t - start >= PARAGRAPH_SECONDS) flush();
    if (!paragraph.length) start = t;
    paragraph.push(line);
  }
  flush();
  return out.join("\n");
}

function videoPage(info: Info) {
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
    `length = ${toml(info.duration ? timestamp(info.duration) : null)}`,
    `short = ${toml(info.media_type === "short")}`,
    `availability = ${toml(info.availability)}`,
    `views = ${toml(info.view_count)}`,
    `likes = ${toml(info.like_count)}`,
    `comments = ${toml(info.comment_count)}`,
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
    .filter((id) => id && exists(`${ROOT}static/thumbs/${id}.jpg`)).slice(0, 3);
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
    ...entries.map((e) => `  { id = ${toml(e.id)}, title = ${toml(e.title || e.id)} },`),
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
  for (const info of jsonFiles(`${CACHE}/videos`, ".info.json")) {
    if (["is_live", "is_upcoming"].includes(info.live_status)) continue;
    const section = info.live_status === "was_live" || info.was_live ? "streams" : "videos";
    write(`${CONTENT}/${section}/${info.id}.md`, videoPage(info));
  }
  for (const data of jsonFiles(`${CACHE}/playlists`, ".json")) {
    write(`${CONTENT}/playlists/${data.id}.md`, playlistPage(data));
  }
}
