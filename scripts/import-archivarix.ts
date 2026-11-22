// Import find-reupload pages of Archivarix Tube (https://tube.archivarix.net/), saved from a browser after the page
// shows the video, into .cache/archivarix/.
// Usage: deno task import-archivarix <page.html>...
// Archivarix keeps the description, length and views of videos that are gone from YouTube. Its channel name is the
// current name of the channel.
import { decodeEntities } from "./import-asmrindex.ts";

const ROOT = new URL("..", import.meta.url).pathname;
const OUT = `${ROOT}.cache/archivarix`;

const seconds = (length: string) => length.split(":").reduce((total, part) => total * 60 + Number(part), 0);

// Read the data of one saved page. The page is rendered by a script, so a page saved before it loaded has no data.
export function parseArchivarixPage(page: string) {
  const html = page.replace(/<svg[\s\S]*?<\/svg>/g, "");
  const id = html.match(/>https:\/\/youtube\.com\/watch\?v=([\w-]{11})</)?.[1];
  if (!id) throw new Error("No Archivarix video page: it has no video ID.");
  const copied = [...html.matchAll(/>([^<>]+)<\/(?:div|span)><button[^>]*title="Copy"/g)].map((m) => m[1]);
  const field = (name: string) => html.match(new RegExp(`>${name}: ([^<]+)<`))?.[1].trim();
  const [uploaded, length, views] = [field("Uploaded"), field("Duration"), field("Views")];
  const description = html.match(/>Description<\/summary><pre[^>]*>([\s\S]*?)<\/pre>/)?.[1];
  const tags = html.match(/>Tags<\/h3><div[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? "";
  return {
    id,
    title: copied[0] ? decodeEntities(copied[0]) : null,
    description: description ? decodeEntities(description).trim() : null,
    upload_date: uploaded ? `${uploaded}T00:00:00.000Z` : null,
    duration: length ? seconds(length) : null,
    view_count: views ? Number(views.replaceAll(",", "")) : null,
    tags: [...tags.matchAll(/<span[^>]*>([^<]+)<\/span>/g)].map((m) => decodeEntities(m[1])),
    channel: copied[1] ? decodeEntities(copied[1]) : null,
    channel_id: copied[2]?.match(/^\((UC[\w-]+)\)$/)?.[1] ?? null,
    url: `https://tube.archivarix.net/find-reupload/${id}`,
  };
}

if (import.meta.main) {
  if (!Deno.args.length) throw new Error("Usage: import-archivarix <page.html>...");
  Deno.mkdirSync(OUT, { recursive: true });
  for (const path of Deno.args) {
    const data = parseArchivarixPage(Deno.readTextFileSync(path));
    // The date that the page was saved.
    const captured = (Deno.statSync(path).mtime ?? new Date()).toISOString();
    Deno.writeTextFileSync(`${OUT}/${data.id}.json`, JSON.stringify({ ...data, captured }, null, 2) + "\n");
    console.log(`${data.id}: ${data.title}`);
  }
}
