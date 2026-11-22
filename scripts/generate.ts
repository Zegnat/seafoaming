// Generate Zola Markdown pages for videos, streams and playlists from .cache/.

import { parse as parseToml } from "@std/toml";

const ROOT = new URL("..", import.meta.url).pathname;
const CACHE = `${ROOT}.cache`;
const CONTENT = `${ROOT}content`;
const COMMUNITY = `${ROOT}community/videos`;
const CAPTIONS = `${ROOT}static/captions`;
// The caption files that this run wrote; the others in static/captions are outdated.
const captionFiles = new Set<string>();
const CHANNEL_ID = "UCBRuxya3juxDB1SOg-QOBpg";
const PARAGRAPH_SECONDS = 60;
const VIDEO_SECTIONS = ["videos", "shorts", "streams", "collabs"];
const LANGUAGES = new Intl.DisplayNames(["en"], { type: "language" });

// deno-lint-ignore no-explicit-any
type Info = Record<string, any>;

// JSON strings, numbers, arrays and booleans are valid TOML values.
const toml = (value: unknown) => JSON.stringify(value ?? null);

// A WebVTT time: hours are optional, as in 01:02.500.
function seconds(stamp: string) {
  return stamp.split(":").reduce((total, part) => total * 60 + Number(part), 0);
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
    const match = raw.match(/^((?:\d+:)?\d\d:\d\d\.\d+) -->/);
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

// Data that the community adds to a video, in community/videos/<id>.md. The generator never writes those files.
export function parseCommunity(text: string) {
  const match = text.match(/^\+\+\+\n(?:([\s\S]*?)\n)?\+\+\+\n?([\s\S]*)$/);
  const data = match ? parseToml(match[1] ?? "") as Record<string, unknown> : {};
  const notes = (match ? match[2] : text).trim();
  return { data, notes };
}

function community(info: Info) {
  const path = `${COMMUNITY}/${info.id}.md`;
  return exists(path)
    ? parseCommunity(Deno.readTextFileSync(path))
    : { data: {} as Record<string, unknown>, notes: "", transcript: "" };
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

export function subtitleFile(info: Info): [string | null, boolean] {
  const manual = Object.keys(info.subtitles ?? {}).filter((lang) => lang === "en" || lang.startsWith("en-"));
  // The automatic "en" track is a machine translation when YouTube recognized the speech in another language.
  const automatic = info.language?.startsWith("en") ? ["en-orig", "en"] : ["en-orig"];
  for (const lang of [...manual, ...automatic]) {
    const path = `${CACHE}/videos/${info.id}.${lang}.vtt`;
    if (exists(path)) return [path, manual.includes(lang)];
  }
  return [null, false];
}

// A WebVTT file of the lines of parseVtt, one cue for each line until the next line starts. parseVtt reads it back
// as the same lines.
export function toVtt(lines: [number, string][]) {
  const time = (t: number) => {
    const ms = Math.round(t * 1000);
    const pad = (n: number, size = 2) => String(n).padStart(size, "0");
    return `${pad(Math.trunc(ms / 3600000))}:${pad(Math.trunc(ms / 60000) % 60)}:${pad(Math.trunc(ms / 1000) % 60)}.${
      pad(ms % 1000, 3)
    }`;
  };
  const cues = lines.map(([t, line], i) =>
    `${time(t)} --> ${time(lines[i + 1]?.[0] ?? t + 5)}\n${line.replaceAll("&", "&amp;").replaceAll("<", "&lt;")}`
  );
  return ["WEBVTT", ...cues].join("\n\n") + "\n";
}

// A transcript with timings can be in the community folder as community/videos/<id>.vtt. source is the transcript
// field of the community file: "whisper" for speech recognition (scripts/whisper.ts), "community" for people.
// kind is where the transcript comes from: youtube (captions that people wrote on YouTube), youtube-automatic, whisper
// or community. Without a transcript there is no kind, and language names the captions that the wiki leaves out.
// file is the WebVTT file to download, text the paragraphs.
function transcript(info: Info, source: unknown = null) {
  const own = `${COMMUNITY}/${info.id}.vtt`;
  const hasOwn = exists(own);
  if (info.asmrindex && !hasOwn) return { text: "" };
  // The transcript of the community folder comes first, then the captions of YouTube.
  const [path, manual] = hasOwn ? [own, false] : subtitleFile(info);
  if (!path) {
    const other = Object.keys(info.automatic_captions ?? {}).find((lang) => lang.endsWith("-orig"));
    return { language: other?.slice(0, -5), text: "" };
  }
  const chapters = info.chapters ?? [];
  const lines = parseVtt(Deno.readTextFileSync(path));
  // The captions of YouTube go to static/captions as a clean file, a start for a transcript of the community.
  // static/transcripts links to the community folder, so the site serves the files of both folders.
  if (!hasOwn) {
    write(`${CAPTIONS}/${info.id}.vtt`, toVtt(lines));
    captionFiles.add(`${info.id}.vtt`);
  }
  const kind = hasOwn ? (source === "whisper" ? "whisper" : "community") : manual ? "youtube" : "youtube-automatic";
  const file = `${hasOwn ? "transcripts" : "captions"}/${info.id}.vtt`;
  const out: string[] = [];
  const paragraph: string[] = [];
  let start = 0, chapter = 0;

  const flush = () => {
    if (!paragraph.length) return;
    const url = `https://www.youtube.com/watch?v=${info.id}&t=${Math.trunc(start)}s`;
    out.push(`[${timestamp(start)}](${url}) ` + escapeMarkdown(paragraph.join(" ")), "");
    paragraph.length = 0;
  };

  for (const [t, line] of lines) {
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
  return { kind, file, text: out.join("\n") };
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

// The Spotify release that the community linked to this video, from .cache/spotify, if it is there.
function spotifyRelease(url: string | null) {
  const id = url?.match(/open\.spotify\.com\/album\/([A-Za-z0-9]{22})/)?.[1];
  const path = `${CACHE}/spotify/${id}.json`;
  return id && exists(path) ? JSON.parse(Deno.readTextFileSync(path)) : null;
}

const RELEASE_TYPES: Record<string, string> = { ALBUM: "Album", EP: "EP", SINGLE: "Single" };

// The Apple Music release behind a link, from .cache/apple, if it is there.
function appleRelease(url: string) {
  const id = url.match(/music\.apple\.com\/.*?(\d+)(?:[?#]|$)/)?.[1];
  const path = `${CACHE}/apple/${id}.json`;
  return id && exists(path) ? JSON.parse(Deno.readTextFileSync(path)) : null;
}

// The episode of the podcast that the community linked to this video, from .cache/spotify/episodes.
function spotifyEpisode(url: string | null) {
  const id = url?.match(/open\.spotify\.com\/episode\/([A-Za-z0-9]{22})/)?.[1];
  const path = `${CACHE}/spotify/episodes/${id}.json`;
  return id && exists(path) ? JSON.parse(Deno.readTextFileSync(path)) : null;
}

function videoPage(info: Info, placeholder: string | null, covers: Set<string> = new Set(), section = "videos") {
  const extra = community(info);
  const said: { kind?: string; file?: string; language?: string; text: string } = transcript(
    info,
    extra.data.transcript,
  );
  // A collab is on another channel: its page names that channel, and its thumbnails are with the other channels.
  const collab = Boolean(info.channel_id && info.channel_id !== CHANNEL_ID);
  const link = (key: string) => typeof extra.data[key] === "string" && extra.data[key] ? extra.data[key] : null;
  // apple_music holds one link or a list, because Apple Music has some recordings twice.
  const appleLinks = [extra.data.apple_music].flat().filter((url): url is string =>
    typeof url === "string" && url !== ""
  );
  // For a video from the ASMR Index, the removed mark of the index is the fallback when YouTube gave no reason.
  const fromIndex = info.asmrindex?.removed ? { status: "removed", by: null, message: null, checked: null } : null;
  const gone = readStatus(info.id) ?? fromIndex;
  const status = gone?.status ??
    ({ unlisted: "unlisted", subscriber_only: "members-only" } as Record<string, string>)[info.availability] ?? null;
  const date = new Date(info.timestamp * 1000).toISOString().replace(/\.\d+Z$/, "Z");
  const fetched = new Date(info.epoch * 1000).toISOString().slice(0, 10);
  const chapters: Info[] = info.chapters ?? [];
  const front = [
    "+++",
    `title = ${toml(info.title)}`,
    `date = ${date}`,
    // Every video has its page at videos/<id>/, whatever list it is in. The alias keeps the old URL of the list working,
    // which hidden pages never had.
    ...(section !== "videos" ? [`path = "videos/${info.id}/"`] : []),
    ...(section !== "videos" && extra.data.hidden !== true ? [`aliases = ["${section}/${info.id}/"]`] : []),
    // A hidden page exists, but no list shows it, for example a video about Seafoam Kitten on another channel.
    ...(extra.data.hidden === true ? ["hidden = true"] : []),
    "",
    "[extra]",
    `id = ${toml(info.id)}`,
    ...(collab
      ? [
        `channel = ${toml(info.channel ?? info.uploader)}`,
        `channel_url = ${toml(info.channel_url ?? `https://www.youtube.com/channel/${info.channel_id}`)}`,
        'folder = "others"',
        `live = ${toml(info.live_status === "was_live" || Boolean(info.was_live))}`,
      ]
      : []),
    `duration = ${toml(info.duration)}`,
    `length = ${toml(info.duration ? timestamp(info.duration) : null)}`,
    `availability = ${toml(info.availability)}`,
    `status = ${toml(status)}`,
    `removed_by = ${toml(gone?.by)}`,
    `status_message = ${toml(gone?.message)}`,
    `status_checked = ${gone?.checked ?? "null"}`,
    `age_restricted = ${toml(info.age_limit >= 18)}`,
    `language = ${toml(info.language)}`,
    `language_name = ${toml(info.language ? LANGUAGES.of(info.language) : null)}`,
    `placeholder = ${toml(placeholder)}`,
    `spotify = ${toml(link("spotify"))}`,
    `spotify_podcast = ${toml(link("spotify_podcast"))}`,
    ...(() => {
      // Each release with its details and tracks, oldest first. A link without data in the cache keeps its URL.
      const releases = appleLinks.map((url) => ({ url, release: appleRelease(url) }))
        .sort((a, b) => (a.release?.date ?? "").localeCompare(b.release?.date ?? ""));
      if (!releases.length) return [];
      return [
        "apple_music = [",
        ...releases.map(({ url, release }) => {
          const fields = inline({
            url,
            year: release?.date?.slice(0, 4),
            id: release?.id,
            name: release?.name,
            type: release ? RELEASE_TYPES[release.type] ?? release.type : null,
            date: release?.date,
            cover: release ? covers.has(release.id) : null,
          });
          const tracks = (release?.tracks ?? []).map((track: Info) =>
            inline({ id: track.id, name: track.name, length: timestamp(track.duration) })
          );
          return `  ${tracks.length ? fields.replace(/ }$/, `, tracks = [${tracks.join(", ")}] }`) : fields},`;
        }),
        "]",
      ];
    })(),
    ...(() => {
      const release = spotifyRelease(link("spotify"));
      if (!release) return [];
      return [
        `spotify_release = ${
          inline({
            id: release.id,
            name: release.name,
            type: RELEASE_TYPES[release.type] ?? release.type,
            date: release.date,
            cover: covers.has(release.id),
          })
        }`,
        "spotify_tracks = [",
        ...release.tracks.map((track: Info) =>
          `  ${inline({ id: track.id, name: track.name, length: timestamp(track.duration) })},`
        ),
        "]",
      ];
    })(),
    ...(() => {
      const episode = spotifyEpisode(link("spotify_podcast"));
      return episode
        ? [
          `spotify_episode = ${
            inline({
              id: episode.id,
              name: episode.name,
              date: episode.date,
              length: timestamp(episode.duration),
              cover: covers.has(episode.id),
            })
          }`,
        ]
        : [];
    })(),
    `views = ${toml(info.view_count)}`,
    `likes = ${toml(info.like_count)}`,
    `comments = ${toml(info.comment_count)}`,
    // yt-dlp gives no comment count when the comments are turned off.
    `comments_off = ${toml(!info.asmrindex && info.comment_count == null)}`,
    `fetched = ${fetched}`,
    `source = ${toml(info.asmrindex ? "asmrindex" : null)}`,
    `source_url = ${toml(info.asmrindex?.url)}`,
    `transcript = ${toml(said.kind)}`,
    `transcript_file = ${toml(said.file)}`,
    `transcript_language = ${toml(said.language)}`,
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
  const notes = extra.notes
    ? (extra.notes.startsWith("## ") ? extra.notes : `## Notes\n\n${extra.notes}`) + "\n\n"
    : "";
  return front.filter((line) => !line.endsWith("= null")).join("\n") + notes + "## Transcript\n\n" + said.text;
}

// The thumbnails of videos by other channels live in static/thumbs/others.
// YouTube gives no title or channel for private and deleted videos in a playlist. The ASMR Index may still know them.
function fromIndex(e: Info): Info {
  const path = `${CACHE}/asmrindex/${e.id}.json`;
  if (e.title || !exists(path)) return e;
  const index = JSON.parse(Deno.readTextFileSync(path));
  return {
    ...e,
    title: index.title,
    duration: e.duration ?? index.duration,
    channel: index.channel,
    channel_id: index.channel_id,
    channel_url: index.channel_id ? `https://www.youtube.com/channel/${index.channel_id}` : null,
    source: "asmrindex",
  };
}

const folderOf = (e: Info) => e.channel_id && e.channel_id !== CHANNEL_ID ? "others" : "";
const thumbExists = (id: string, folder: string) =>
  exists(`${ROOT}static/thumbs/${folder ? `${folder}/` : ""}${id}-320.webp`);

// Write an inline TOML table of the keys that have a value.
const inline = (fields: Record<string, unknown>) =>
  `{ ${
    Object.entries(fields).filter(([, value]) => value !== null && value !== undefined && value !== "")
      .map(([key, value]) => `${key} = ${toml(value)}`).join(", ")
  } }`;

function playlistPage(data: Info, placeholders: Map<string, string | null>) {
  const entries: Info[] = (data.entries ?? []).map(fromIndex);
  // A playlist of mostly other channels, such as Favorite ASMR, keeps its page but is hidden from the playlist list.
  const known = entries.filter((e) => e.channel_id);
  const own = known.filter((e) => e.channel_id === CHANNEL_ID).length;
  const hidden = known.length > 0 && own / known.length < 0.5;
  // The playlist thumbnail is the thumbnail of one of its videos. The stack puts it on top of the next two.
  const thumbnail = data.thumbnails?.[0]?.url?.match(/\/vi\/([^/]+)\//)?.[1];
  const byId = new Map(entries.map((e) => [e.id, e]));
  const stack = [...new Set([thumbnail, ...entries.map((e) => e.id)])]
    .map((id) => ({ id, folder: byId.has(id) ? folderOf(byId.get(id)!) : "" }))
    .filter(({ id, folder }) => id && thumbExists(id, folder)).slice(0, 3);
  return [
    "+++",
    `title = ${toml(data.title)}`,
    `hidden = ${toml(hidden)}`,
    "",
    "[extra]",
    `id = ${toml(data.id)}`,
    "stack = [",
    ...stack.map(({ id, folder }) => `  ${inline({ id, folder, placeholder: placeholders.get(id) })},`),
    "]",
    `views = ${toml(data.view_count)}`,
    `updated = ${data.modified_date ? data.modified_date.replace(/(\d{4})(\d\d)(\d\d)/, "$1-$2-$3") : "null"}`,
    `fetched = ${new Date(data.epoch * 1000).toISOString().slice(0, 10)}`,
    `description = ${toml(data.description || "")}`,
    "videos = [",
    // Videos of other channels get no page of their own, so the playlist keeps what the table needs to show them.
    ...entries.map((e) => {
      const folder = folderOf(e);
      const other = folder && thumbExists(e.id, folder);
      return `  ${
        inline({
          id: e.id,
          title: e.title || e.id,
          status: readStatus(e.id)?.status,
          source: e.source,
          channel: folder ? e.channel : null,
          channel_url: folder ? e.channel_url : null,
          length: folder && e.duration ? timestamp(e.duration) : null,
          duration: folder ? e.duration : null,
          views: folder ? e.view_count : null,
          folder: other ? folder : null,
          placeholder: other ? placeholders.get(e.id) : null,
        })
      },`;
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
  const { thumbnail, cover } = await import("./images.ts");
  // Covers of the Spotify releases, podcast episodes and Apple Music releases that community files link to.
  const covers = new Set<string>();
  if (exists(`${ROOT}community/videos`)) {
    for (const file of Deno.readDirSync(`${ROOT}community/videos`)) {
      const text = Deno.readTextFileSync(`${ROOT}community/videos/${file.name}`);
      for (const [, id] of text.matchAll(/open\.spotify\.com\/(?:album|episode)\/([A-Za-z0-9]{22})/g)) {
        if (await cover(id)) covers.add(id);
      }
      for (const [, id] of text.matchAll(/music\.apple\.com\/[^"\s]*?(\d+)(?=["?#\s]|$)/g)) {
        if (await cover(id, "apple")) covers.add(id);
      }
    }
  }
  // The playlist stacks reuse the placeholders of their videos.
  // Collabs: the entries of the collab playlist, and videos that a community file marks with collab = true. A video of
  // another channel can also get a hidden page, when its community file says hidden = true.
  const collabs = new Set<string>(
    exists(`${CACHE}/collabs.json`)
      ? (JSON.parse(Deno.readTextFileSync(`${CACHE}/collabs.json`)).entries ?? []).map((e: Info) => e.id)
      : [],
  );
  if (exists(COMMUNITY)) {
    for (const file of Deno.readDirSync(COMMUNITY)) {
      if (/^(collab|hidden)\s*=\s*true\s*$/m.test(Deno.readTextFileSync(`${COMMUNITY}/${file.name}`))) {
        collabs.add(file.name.replace(/\.md$/, ""));
      }
    }
  }
  const creators = new Set<string>();
  const placeholders = new Map<string, string | null>();
  for (const info of jsonFiles(`${CACHE}/videos`, ".info.json")) {
    if (["is_live", "is_upcoming"].includes(info.live_status)) continue;
    const collab = info.channel_id && info.channel_id !== CHANNEL_ID;
    if (collab && !collabs.has(info.id)) continue;
    if (collab && info.channel) creators.add(info.channel.trim());
    const section = collab
      ? "collabs"
      : info.live_status === "was_live" || info.was_live
      ? "streams"
      : info.media_type === "short"
      ? "shorts"
      : "videos";
    const placeholder = await thumbnail(info.id, collab ? "others" : "");
    placeholders.set(info.id, placeholder);
    write(`${CONTENT}/${section}/${info.id}.md`, videoPage(info, placeholder, covers, section));
    // A video can move to another section, for example when YouTube marks it as a short later.
    for (const other of VIDEO_SECTIONS.filter((s) => s !== section)) {
      if (exists(`${CONTENT}/${other}/${info.id}.md`)) Deno.removeSync(`${CONTENT}/${other}/${info.id}.md`);
    }
  }
  // Videos that only The ASMR Index knows, because they were gone before the first download of the wiki.
  for (const entry of jsonFiles(`${CACHE}/asmrindex`, ".json")) {
    if (exists(`${CACHE}/videos/${entry.id}.info.json`)) continue;
    // Videos of other channels only get a page of their own when they are collabs.
    const collab = entry.channel_id && entry.channel_id !== CHANNEL_ID;
    if (collab && !collabs.has(entry.id)) continue;
    if (collab && entry.channel) creators.add(entry.channel.trim());
    const info: Info = {
      id: entry.id,
      channel: entry.channel,
      channel_id: entry.channel_id,
      title: entry.title,
      description: entry.description,
      timestamp: Date.parse(entry.upload_date) / 1000,
      duration: entry.duration,
      epoch: Date.parse(entry.captured) / 1000,
      asmrindex: entry,
    };
    const placeholder = await thumbnail(info.id, collab ? "others" : "");
    placeholders.set(info.id, placeholder);
    // The index does not say if a video was a short or a live stream.
    const section = collab ? "collabs" : "videos";
    write(`${CONTENT}/${section}/${info.id}.md`, videoPage(info, placeholder, covers, section));
  }
  // A caption file goes when the community has a transcript of the video, or when YouTube has no captions now.
  for (const file of exists(CAPTIONS) ? [...Deno.readDirSync(CAPTIONS)] : []) {
    if (!captionFiles.has(file.name)) Deno.removeSync(`${CAPTIONS}/${file.name}`);
  }
  for (const data of jsonFiles(`${CACHE}/playlists`, ".json")) {
    for (const e of (data.entries ?? []).map(fromIndex)) {
      if (!folderOf(e) || placeholders.has(e.id)) continue;
      placeholders.set(e.id, await thumbnail(e.id, folderOf(e)));
      if (e.channel) creators.add(e.channel.trim());
    }
    write(`${CONTENT}/playlists/${data.id}.md`, playlistPage(data, placeholders));
  }
  // The license text for thumbnails of other channels names those channels.
  // Written directly: the folder exists, and the task may only write this one file there.
  Deno.writeTextFileSync(
    `${ROOT}LICENSES/LicenseRef-YouTubeCreators.txt`,
    [
      "All rights reserved by the creators of the videos.",
      "",
      "These are thumbnails and snapshots of videos by other YouTube channels, made",
      "smaller, with blurred placeholders made from them. The videos appear in",
      'playlists of Seafoam Kitten ASMR, for example "Favorite ASMR", or Seafoam',
      "Kitten appears in them, as collabs. The collab pages also quote the titles,",
      "descriptions, chapter titles and captions of these videos. The repository",
      "includes this material for reference. The rights holders did not give a",
      "license for it, so the licenses of this repository do not apply to it.",
      "",
      "The creators of the videos are these YouTube channels:",
      "",
      ...[...creators].sort((a, b) => a.localeCompare(b)).map((name) => `- ${name}`),
      "",
    ].join("\n"),
  );
}
