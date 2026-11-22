// Find the Spotify releases of the videos. On Spotify, each video is an EP or album named after the video,
// with its chapters as tracks. Many videos are also an episode of the podcast of the channel.
// Usage:
//   deno task spotify fetch [ws://127.0.0.1:9223/session]  Collect the releases. The list of releases needs a browser:
//                                                         start Firefox with --remote-debugging-port=9223 first.
//   deno task spotify match [--apply]                     Compare releases and episodes with the videos and write a
//                                                         review list; --apply writes clear matches into
//                                                         community/videos/.
import { links } from "./bidi.ts";
import { decodeBase64 } from "@std/encoding/base64";

const ROOT = new URL("..", import.meta.url).pathname;
const CACHE = `${ROOT}.cache/spotify`;
const ARTIST = "6uh6geb4QlGeZjRo9FP3p1";
const SHOW = "033zpJYUkfy02osi3mxfDh";

// deno-lint-ignore no-explicit-any
type Data = Record<string, any>;
export type Album = {
  id: string;
  name: string;
  type: string;
  date: string;
  copyright: string | null;
  cover: string | null;
  tracks: { id: string; name: string; number: number; duration: number }[];
};
export type Episode = {
  id: string;
  name: string;
  date: string;
  duration: number;
  description: string;
  cover: string | null;
};

const exists = (path: string) => {
  try {
    Deno.statSync(path);
    return true;
  } catch {
    return false;
  }
};
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// The URL of the largest image of a cover.
const largest = (coverArt: Data | undefined): string | null =>
  (coverArt?.sources ?? []).toSorted((a: Data, b: Data) => b.width - a.width)[0]?.url ?? null;

// An album page carries its data as base64 encoded JSON in the script element "initialState".
export function parseAlbumPage(html: string, id: string): Album | null {
  const raw = html.match(/<script[^>]*id="initialState"[^>]*>([^<]*)<\/script>/)?.[1]?.trim();
  if (!raw) return null;
  const album = JSON.parse(new TextDecoder().decode(decodeBase64(raw))).entities?.items?.[`spotify:album:${id}`];
  if (!album?.name) return null;
  const pad = (n: number) => String(n ?? 1).padStart(2, "0");
  return {
    id,
    name: album.name,
    type: album.type,
    date: `${album.date.year}-${pad(album.date.month)}-${pad(album.date.day)}`,
    copyright: album.copyright?.items?.find((item: Data) => item.type === "C")?.text ?? null,
    cover: largest(album.coverArt),
    tracks: (album.tracksV2?.items ?? []).map(({ track }: Data) => ({
      id: track.id,
      name: track.name,
      number: track.trackNumber,
      duration: Math.round(track.duration.totalMilliseconds / 1000),
    })),
  };
}

// An episode page carries its data the same way.
export function parseEpisodePage(html: string, id: string): Episode | null {
  const raw = html.match(/<script[^>]*id="initialState"[^>]*>([^<]*)<\/script>/)?.[1]?.trim();
  if (!raw) return null;
  const episode = JSON.parse(new TextDecoder().decode(decodeBase64(raw))).entities?.items?.[`spotify:episode:${id}`];
  if (!episode?.name) return null;
  return {
    id,
    name: episode.name.trim(),
    date: episode.releaseDate.isoString.slice(0, 10),
    duration: Math.round(episode.duration.totalMilliseconds / 1000),
    description: episode.description ?? "",
    cover: largest(episode.coverArt),
  };
}

const words = (text: string) =>
  new Set(
    text.toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]+/g, " ").split(" ")
      .filter((w) => w.length > 2 && !["asmr", "the", "and", "you", "your", "with", "for", "ep"].includes(w)),
  );
// Words count by how rare they are in the video titles: "candyland" says much more than "ears" or "sounds".
let weights = new Map<string, number>();
export function setWeights(titles: string[]) {
  const counts = new Map<string, number>();
  for (const title of titles) for (const word of words(title)) counts.set(word, (counts.get(word) ?? 0) + 1);
  weights = new Map([...counts].map(([word, count]) => [word, Math.log((titles.length + 1) / count)]));
}
const weight = (word: string) => weights.get(word) ?? Math.log(weights.size + 1);
const overlap = (a: Set<string>, b: Set<string>) => {
  const total = [...a].reduce((sum, w) => sum + weight(w), 0);
  return total ? [...a].filter((w) => b.has(w)).reduce((sum, w) => sum + weight(w), 0) / total : 0;
};
const DAY = 86_400_000;

// How well a release fits a video, from 0 to 1, with the signals that make it up.
export function score(album: Album, video: Data) {
  const title = overlap(words(album.name), words(video.title));
  const total = album.tracks.reduce((sum, track) => sum + track.duration, 0);
  const difference = Math.abs(total - (video.duration ?? 0));
  const length = difference <= 10 ? 1 : Math.max(0, 1 - difference / 300);
  const chapters: Data[] = video.chapters ?? [];
  const named =
    album.tracks.filter((track) => chapters.some((chapter) => overlap(words(track.name), words(chapter.title)) >= 0.6))
      .length;
  const tracks = album.tracks.length && chapters.length ? named / album.tracks.length : 0;
  // The audio usually comes out a few weeks after the video.
  const days = (Date.parse(album.date) - video.timestamp * 1000) / DAY;
  const date = days >= -7 && days <= 120 ? 1 : 0;
  const combined = 0.35 * title + 0.35 * length + 0.2 * tracks + 0.1 * date;
  return { score: combined, title, length, difference, tracks, days: Math.round(days) };
}

// Albums and episodes have their own IDs, so their covers share one folder.
async function saveCover(id: string, url: string | null) {
  if (!url) return;
  const cover = await fetch(url);
  if (cover.ok) Deno.writeFileSync(`${CACHE}/covers/${id}.jpg`, new Uint8Array(await cover.arrayBuffer()));
  else await cover.body?.cancel();
}

async function fetchAlbums(browser: string) {
  Deno.mkdirSync(`${CACHE}/covers`, { recursive: true });
  const ids = await links(browser, `https://open.spotify.com/artist/${ARTIST}/discography/all`, "album");
  console.log(`${ids.length} releases on Spotify.`);
  for (const id of ids) {
    if (exists(`${CACHE}/${id}.json`)) continue;
    // Album pages work without a browser.
    const response = await fetch(`https://open.spotify.com/album/${id}`);
    const album = response.ok ? parseAlbumPage(await response.text(), id) : null;
    if (!album) {
      console.log(`${id}: no data (${response.status})`);
      continue;
    }
    Deno.writeTextFileSync(`${CACHE}/${id}.json`, JSON.stringify(album, null, 2) + "\n");
    await saveCover(id, album.cover);
    console.log(`${album.date} ${album.type} ${album.name}`);
    await pause(1000);
  }
  Deno.mkdirSync(`${CACHE}/episodes`, { recursive: true });
  const episodes = await links(browser, `https://open.spotify.com/show/${SHOW}`, "episode");
  console.log(`${episodes.length} podcast episodes on Spotify.`);
  for (const id of episodes) {
    if (exists(`${CACHE}/episodes/${id}.json`)) continue;
    const response = await fetch(`https://open.spotify.com/episode/${id}`);
    const episode = response.ok ? parseEpisodePage(await response.text(), id) : null;
    if (!episode) {
      console.log(`${id}: no data (${response.status})`);
      continue;
    }
    Deno.writeTextFileSync(`${CACHE}/episodes/${id}.json`, JSON.stringify(episode, null, 2) + "\n");
    await saveCover(id, episode.cover);
    console.log(`${episode.date} episode ${episode.name}`);
    await pause(1000);
  }
}

// The video of a podcast episode. Episodes have the exact length of their video, so the length finds the
// candidates; the title and the description decide between videos of the same length.
const sameText = (a: string, b: string) =>
  a.replace(/\s+/g, " ").trim().slice(0, 200) === b.replace(/\s+/g, " ").trim().slice(0, 200);
export function matchEpisode(episode: Episode, videos: Data[]) {
  const published = Date.parse(episode.date) / 1000 + 7 * DAY / 1000;
  const candidates = videos.filter((video) =>
    Math.abs((video.duration ?? 0) - episode.duration) <= 2 && video.timestamp <= published
  ).map((video) => ({
    video,
    description: sameText(video.description ?? "", episode.description),
    title: overlap(words(video.title), words(episode.name)),
  })).sort((a, b) => b.title - a.title || Number(b.description) - Number(a.description));
  const [best, next] = candidates;
  if (!best) return null;
  // Most episodes carry the title of their video, so a title that agrees far better than the next one is clear too.
  const clear = !next || (best.description && !next.description) || (best.title >= 0.9 && next.title < 0.5);
  return { video: best.video, clear, candidates: candidates.length };
}

// Write a link into the community file of a video, unless the file already has a value for the key: a link or a list.
export function writeLink(id: string, key: string, url: string) {
  const path = `${ROOT}community/videos/${id}.md`;
  if (!exists(path)) {
    Deno.writeTextFileSync(path, `+++\n${key} = "${url}"\n+++\n`);
    return true;
  }
  const text = Deno.readTextFileSync(path);
  const line = new RegExp(`^${key}\\s*=.*$`, "m");
  if (new RegExp(`^${key}\\s*=\\s*("[^"]+"|\\[)`, "m").test(text)) return false;
  Deno.writeTextFileSync(
    path,
    line.test(text) ? text.replace(line, `${key} = "${url}"`) : text.replace(/^\+\+\+\n/, `+++\n${key} = "${url}"\n`),
  );
  return true;
}

// Clear matches: the length agrees closely and the title agrees, or the track names agree with the chapters.
export const clear = (s: ReturnType<typeof score>) =>
  (s.difference <= 5 && s.title >= 0.5) || (s.difference <= 20 && s.title >= 0.7) ||
  (s.difference <= 60 && s.tracks >= 0.6);

function match(apply: boolean) {
  const albums: Album[] = [...Deno.readDirSync(CACHE)].filter((e) => e.name.endsWith(".json"))
    .map((e) => JSON.parse(Deno.readTextFileSync(`${CACHE}/${e.name}`)));
  const videos: Data[] = [...Deno.readDirSync(`${ROOT}.cache/videos`)].filter((e) => e.name.endsWith(".info.json"))
    .map((e) => JSON.parse(Deno.readTextFileSync(`${ROOT}.cache/videos/${e.name}`)));
  setWeights(videos.map((video) => video.title));
  // Score every pair, then take the best pairs first, so that each release and each video is used once.
  const pairs = albums.flatMap((album) => videos.map((video) => ({ album, video, ...score(album, video) })))
    .filter((pair) => pair.score >= 0.3).sort((a, b) => b.score - a.score);
  const usedAlbums = new Set<string>(), usedVideos = new Set<string>();
  const chosen = pairs.filter((pair) => {
    if (usedAlbums.has(pair.album.id) || usedVideos.has(pair.video.id)) return false;
    usedAlbums.add(pair.album.id);
    usedVideos.add(pair.video.id);
    return true;
  });
  const row = (p: (typeof chosen)[number]) =>
    `| ${p.score.toFixed(2)} | ${p.title.toFixed(2)} | ${p.difference}s | ${p.tracks.toFixed(2)} | ${p.days} | [${
      p.album.name.replaceAll("|", "\\|")
    }](https://open.spotify.com/album/${p.album.id}) | [${
      p.video.title.replaceAll("|", "\\|")
    }](https://www.youtube.com/watch?v=${p.video.id}) |`;
  const header = "| Score | Title | Length | Tracks | Days | Spotify | YouTube |\n|---|---|---|---|---|---|---|";
  const sure = chosen.filter(clear), unsure = chosen.filter((p) => !clear(p));
  const unmatched = albums.filter((album) => !usedAlbums.has(album.id));
  const episodes: Episode[] = exists(`${CACHE}/episodes`)
    ? [...Deno.readDirSync(`${CACHE}/episodes`)].map((e) =>
      JSON.parse(Deno.readTextFileSync(`${CACHE}/episodes/${e.name}`))
    )
      .sort((a, b) => a.date.localeCompare(b.date))
    : [];
  const episodeMatches = episodes.map((episode) => ({ episode, match: matchEpisode(episode, videos) }));
  const episodeRow = ({ episode, match }: (typeof episodeMatches)[number]) =>
    `| ${episode.date} | ${match ? (match.clear ? "clear" : `unsure, ${match.candidates} videos`) : "none"} | [${
      episode.name.replaceAll("|", "\\|")
    }](https://open.spotify.com/episode/${episode.id}) | ${
      match ? `[${match.video.title.replaceAll("|", "\\|")}](https://www.youtube.com/watch?v=${match.video.id})` : ""
    } |`;
  Deno.writeTextFileSync(
    `${CACHE}/review.md`,
    [
      `# Spotify matches`,
      "",
      `## Clear (${sure.length})`,
      "",
      header,
      ...sure.map(row),
      "",
      `## Unsure (${unsure.length})`,
      "",
      header,
      ...unsure.map(row),
      "",
      `## Releases without a match (${unmatched.length})`,
      "",
      ...unmatched.map((a) => `- ${a.date} [${a.name}](https://open.spotify.com/album/${a.id})`),
      "",
      `## Podcast episodes (${episodes.length})`,
      "",
      "| Date | Match | Episode | YouTube |\n|---|---|---|---|",
      ...episodeMatches.map(episodeRow),
      "",
    ].join("\n"),
  );
  console.log(
    `${sure.length} clear, ${unsure.length} unsure, ${unmatched.length} without a match. See .cache/spotify/review.md`,
  );
  const clearEpisodes = episodeMatches.filter(({ match }) => match?.clear);
  console.log(`Podcast: ${clearEpisodes.length} of ${episodes.length} episodes match clearly.`);
  if (!apply) return;
  let written = 0;
  for (const { album, video } of sure) {
    if (writeLink(video.id, "spotify", `https://open.spotify.com/album/${album.id}`)) written++;
  }
  for (const { episode, match } of clearEpisodes) {
    if (writeLink(match!.video.id, "spotify_podcast", `https://open.spotify.com/episode/${episode.id}`)) written++;
  }
  console.log(`Wrote ${written} Spotify links into community/videos/.`);
}

if (import.meta.main) {
  const [mode, argument] = Deno.args;
  if (mode === "fetch") await fetchAlbums(argument ?? "ws://127.0.0.1:9223/session");
  else if (mode === "match") match(argument === "--apply");
  else console.log("Usage: deno task spotify fetch [ws://127.0.0.1:9223/session] | match [--apply]");
}
