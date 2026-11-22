// Import video pages of Filmot (https://filmot.com/), saved from a browser, into .cache/filmot/.
// Usage: deno task import-filmot <page.html>...
// Filmot keeps the title, channel and statistics of videos that are gone from YouTube, but no description or images.
import { decodeEntities } from "./import-asmrindex.ts";

const ROOT = new URL("..", import.meta.url).pathname;
const OUT = `${ROOT}.cache/filmot`;

// Read the data of one video page. The view count is rounded, as in "14.2K views", so only the likes are kept.
export function parseFilmotPage(html: string) {
  const id = html.match(/"videoID":"([\w-]{11})"/)?.[1];
  if (!id) throw new Error("No Filmot video page: it has no video ID.");
  const title = html.match(/>([^<>]*)<a href="https:\/\/youtube\.com\/watch\?v=[\w-]{11}"/)?.[1];
  const channel = html.match(/href="\/channel\/(UC[\w-]+)\/\d+\/([^"]+)"/);
  const date = html.match(/(\d{1,2} \w{3} \d{4})\s*<\/div>/)?.[1];
  const likes = html.match(/([\d,]+) likes/)?.[1];
  return {
    id,
    title: title ? decodeEntities(title.trim()) : null,
    upload_date: date ? new Date(`${date} UTC`).toISOString() : null,
    like_count: likes ? Number(likes.replaceAll(",", "")) : null,
    channel: channel ? decodeURIComponent(channel[2].replaceAll("+", " ")) : null,
    channel_id: channel?.[1] ?? null,
    url: `https://filmot.com/video/${id}`,
  };
}

if (import.meta.main) {
  if (!Deno.args.length) throw new Error("Usage: import-filmot <page.html>...");
  Deno.mkdirSync(OUT, { recursive: true });
  for (const path of Deno.args) {
    const data = parseFilmotPage(Deno.readTextFileSync(path));
    // The date that the page was saved.
    const captured = (Deno.statSync(path).mtime ?? new Date()).toISOString();
    Deno.writeTextFileSync(`${OUT}/${data.id}.json`, JSON.stringify({ ...data, captured }, null, 2) + "\n");
    console.log(`${data.id}: ${data.title}`);
  }
}
