// Find the Apple Music releases of the videos. Most of them are the same releases as on Spotify; Apple Music also
// has an older catalog that Spotify does not have.
// Usage:
//   deno task apple fetch [ws://127.0.0.1:9223/session]  Collect the releases. The list of releases needs a browser:
//                                                       start Firefox with --remote-debugging-port=9223 first.
//   deno task apple match [--apply]                     Compare the releases with the Spotify releases and the
//                                                       videos and write a review list; --apply writes clear
//                                                       matches into community/videos/.
import { links } from "./bidi.ts";
import { type Album, clear, score, setWeights, writeLink } from "./spotify.ts";

const ROOT = new URL("..", import.meta.url).pathname;
const CACHE = `${ROOT}.cache/apple`;
const ARTIST = "https://music.apple.com/us/artist/seafoam-kittens-asmr/1457732912";

// deno-lint-ignore no-explicit-any
type Data = Record<string, any>;
export type AppleAlbum = Album & { url: string };

const exists = (path: string) => {
  try {
    Deno.statSync(path);
    return true;
  } catch {
    return false;
  }
};
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// A release from the answer of the iTunes lookup service: the collection and its tracks.
export function toAlbum(collection: Data, tracks: Data[]): AppleAlbum {
  const type = collection.collectionName.match(/ - (Single|EP)$/)?.[1];
  return {
    id: String(collection.collectionId),
    name: collection.collectionName.replace(/ - (Single|EP)$/, ""),
    type: type ? type.toUpperCase() : "ALBUM",
    date: collection.releaseDate.slice(0, 10),
    copyright: collection.copyright ?? null,
    // The service gives a 100 px cover; the same address gives larger sizes.
    cover: collection.artworkUrl100?.replace(/\/100x100bb\./, "/600x600bb.") ?? null,
    url: collection.collectionViewUrl.replace(/\?.*$/, ""),
    tracks: tracks.toSorted((a, b) => (a.discNumber - b.discNumber) || (a.trackNumber - b.trackNumber))
      .map((track, i) => ({
        id: String(track.trackId),
        name: track.trackName,
        number: i + 1,
        duration: Math.round((track.trackTimeMillis ?? 0) / 1000),
      })),
  };
}

async function fetchAlbums(browser: string) {
  Deno.mkdirSync(CACHE, { recursive: true });
  // The artist page shows the first releases; the pages for albums and for singles and EPs list all of them.
  const ids = new Set<string>();
  for (const section of ["full-albums", "singles"]) {
    for (const id of await links(browser, `${ARTIST}/${section}`, "album", "\\d+")) ids.add(id);
  }
  console.log(`${ids.size} releases on Apple Music.`);
  // The lookup service gives the details and tracks of many releases at once.
  const missing = [...ids].filter((id) => !exists(`${CACHE}/${id}.json`));
  for (let i = 0; i < missing.length; i += 50) {
    const batch = missing.slice(i, i + 50);
    const response = await fetch(`https://itunes.apple.com/lookup?entity=song&limit=200&id=${batch.join(",")}`);
    if (!response.ok) {
      console.log(`lookup failed (${response.status}); try again later`);
      await response.body?.cancel();
      break;
    }
    const results: Data[] = (await response.json()).results;
    for (const collection of results.filter((r) => r.wrapperType === "collection")) {
      const tracks = results.filter((r) => r.wrapperType === "track" && r.collectionId === collection.collectionId);
      const album = toAlbum(collection, tracks);
      Deno.writeTextFileSync(`${CACHE}/${album.id}.json`, JSON.stringify(album, null, 2) + "\n");
    }
    console.log(`${Math.min(i + 50, missing.length)} of ${missing.length} looked up`);
    await pause(2000);
  }
  // The covers, for the release section on the video pages.
  Deno.mkdirSync(`${CACHE}/covers`, { recursive: true });
  for (const id of ids) {
    if (!exists(`${CACHE}/${id}.json`) || exists(`${CACHE}/covers/${id}.jpg`)) continue;
    const { cover } = JSON.parse(Deno.readTextFileSync(`${CACHE}/${id}.json`));
    if (!cover) continue;
    const response = await fetch(cover);
    if (response.ok) Deno.writeFileSync(`${CACHE}/covers/${id}.jpg`, new Uint8Array(await response.arrayBuffer()));
    else await response.body?.cancel();
    await pause(300);
  }
}

// The same release on Spotify: the same track names, or the same name, and about the same length.
const norm = (text: string) => text.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();
const total = (album: Album) => album.tracks.reduce((sum, track) => sum + track.duration, 0);
export function isTwin(apple: Album, spotify: Album) {
  const tracks = (album: Album) => album.tracks.map((track) => norm(track.name)).join("|");
  return Math.abs(total(apple) - total(spotify)) <= 5 &&
    (tracks(apple) === tracks(spotify) || norm(apple.name) === norm(spotify.name));
}

function match(apply: boolean) {
  const read = (dir: string) =>
    [...Deno.readDirSync(dir)].filter((e) => e.isFile && e.name.endsWith(".json"))
      .map((e) => JSON.parse(Deno.readTextFileSync(`${dir}/${e.name}`)));
  const apples: AppleAlbum[] = read(CACHE);
  const spotifies: Album[] = read(`${ROOT}.cache/spotify`);
  const videos: Data[] = [...Deno.readDirSync(`${ROOT}.cache/videos`)].filter((e) => e.name.endsWith(".info.json"))
    .map((e) => JSON.parse(Deno.readTextFileSync(`${ROOT}.cache/videos/${e.name}`)));
  setWeights(videos.map((video) => video.title));
  // Removed and private videos that only The ASMR Index knows can have a release too.
  const downloaded = new Set(videos.map((video) => video.id));
  for (const entry of read(`${ROOT}.cache/asmrindex`)) {
    if (downloaded.has(entry.id)) continue;
    videos.push({ ...entry, timestamp: Date.parse(entry.upload_date) / 1000, chapters: [] });
  }
  // The videos of the Spotify releases, and the videos that already have an Apple Music link, from the community files.
  const bySpotify = new Map<string, string>();
  const taken = new Set<string>();
  for (const e of Deno.readDirSync(`${ROOT}community/videos`)) {
    const text = Deno.readTextFileSync(`${ROOT}community/videos/${e.name}`);
    const id = e.name.replace(/\.md$/, "");
    const album = text.match(/open\.spotify\.com\/album\/([A-Za-z0-9]{22})/)?.[1];
    if (album) bySpotify.set(album, id);
    if (/^apple_music\s*=\s*("[^"]+"|\[)/m.test(text)) taken.add(id);
  }
  // First the twins of Spotify releases, which take the video of that release.
  const twins = apples.flatMap((apple) => {
    const spotify = spotifies.find((s) => isTwin(apple, s));
    const video = spotify && bySpotify.get(spotify.id);
    return video ? [{ apple, spotify, video }] : [];
  });
  for (const { video } of twins) taken.add(video);
  // Then the other releases against the videos that are left, best pairs first, like the Spotify matcher.
  const rest = apples.filter((apple) => !twins.some((t) => t.apple.id === apple.id));
  const free = videos.filter((video) => !taken.has(video.id));
  const pairs = rest.flatMap((album) => free.map((video) => ({ album, video, ...score(album, video) })))
    .filter((pair) => pair.score >= 0.3).sort((a, b) => b.score - a.score);
  const usedAlbums = new Set<string>(), usedVideos = new Set<string>();
  const chosen = pairs.filter((pair) => {
    if (usedAlbums.has(pair.album.id) || usedVideos.has(pair.video.id)) return false;
    usedAlbums.add(pair.album.id);
    usedVideos.add(pair.video.id);
    return true;
  });
  const sure = chosen.filter(clear), unsure = chosen.filter((p) => !clear(p));
  const unmatched = rest.filter((album) => !usedAlbums.has(album.id));
  const cell = (text: string) => text.replaceAll("|", "\\|");
  const row = (p: (typeof chosen)[number]) =>
    `| ${p.score.toFixed(2)} | ${p.title.toFixed(2)} | ${p.difference}s | ${p.tracks.toFixed(2)} | ${p.days} | [${
      cell(p.album.name)
    }](${p.album.url}) | [${cell(p.video.title)}](https://www.youtube.com/watch?v=${p.video.id}) |`;
  const header = "| Score | Title | Length | Tracks | Days | Apple Music | YouTube |\n|---|---|---|---|---|---|---|";
  Deno.writeTextFileSync(
    `${CACHE}/review.md`,
    [
      "# Apple Music matches",
      "",
      `## Twins of Spotify releases (${twins.length})`,
      "",
      ...twins.map(({ apple, video }) => `- [${apple.name}](${apple.url}): https://www.youtube.com/watch?v=${video}`),
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
      ...unmatched.map((a) => `- ${a.date} [${a.name}](${a.url})`),
      "",
    ].join("\n"),
  );
  console.log(
    `${apples.length} releases: ${twins.length} twins of Spotify releases, ${sure.length} clear, ${unsure.length} unsure, ${unmatched.length} without a match. See .cache/apple/review.md`,
  );
  if (!apply) return;
  let written = 0;
  for (const { apple, video } of twins) if (writeLink(video, "apple_music", apple.url)) written++;
  for (const { album, video } of sure) if (writeLink(video.id, "apple_music", (album as AppleAlbum).url)) written++;
  console.log(`Wrote ${written} Apple Music links into community/videos/.`);
}

if (import.meta.main) {
  const [mode, argument] = Deno.args;
  if (mode === "fetch") await fetchAlbums(argument ?? "ws://127.0.0.1:9223/session");
  else if (mode === "match") match(argument === "--apply");
  else console.log("Usage: deno task apple fetch [ws://127.0.0.1:9223/session] | match [--apply]");
}
