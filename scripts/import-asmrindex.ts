// Import a capture of The ASMR Index (https://www.theasmrindex.com/) into .cache/asmrindex/ and .cache/thumbs/.
// Usage: deno task import-asmrindex <pages.warc.gz> <images.warc.gz>
// The index keeps data about videos that are gone from YouTube, so the wiki can still show them.
import { gunzipSync } from "node:zlib";

const ROOT = new URL("..", import.meta.url).pathname;
const OUT = `${ROOT}.cache/asmrindex`;
const THUMBS = `${ROOT}.cache/thumbs`;
const SITE = "https://www.theasmrindex.com";

type Response = { url: string; date: string; body: Uint8Array };

// A WARC file is a series of gzip members; gunzip reads them all. Each record has headers and a block,
// and the block of a response record is a full HTTP response.
export function* responses(warc: Uint8Array): Generator<Response> {
  const data = gunzipSync(warc);
  const latin1 = new TextDecoder("latin1");
  let at = 0;
  while (at < data.length) {
    const start = data.indexOf(0x57, at); // "W" of "WARC/"
    if (start === -1) return;
    const headEnd = findBlankLine(data, start);
    const head = latin1.decode(data.subarray(start, headEnd));
    const headers = Object.fromEntries(
      head.split("\r\n").slice(1).map((
        line,
      ) => [line.slice(0, line.indexOf(":")).toLowerCase(), line.slice(line.indexOf(":") + 1).trim()]),
    );
    const length = Number(headers["content-length"] ?? 0);
    const block = data.subarray(headEnd + 4, headEnd + 4 + length);
    at = headEnd + 4 + length;
    if (headers["warc-type"] !== "response") continue;
    const bodyStart = findBlankLine(block, 0);
    const httpHead = latin1.decode(block.subarray(0, bodyStart)).toLowerCase();
    let body: Uint8Array = block.subarray(bodyStart + 4);
    if (httpHead.includes("transfer-encoding: chunked")) body = unchunk(body);
    if (httpHead.includes("content-encoding: gzip")) body = gunzipSync(body);
    yield { url: headers["warc-target-uri"].replace(/^<|>$/g, ""), date: headers["warc-date"], body };
  }
}

function findBlankLine(data: Uint8Array, from: number) {
  for (let i = from; i < data.length - 3; i++) {
    if (data[i] === 13 && data[i + 1] === 10 && data[i + 2] === 13 && data[i + 3] === 10) return i;
  }
  return data.length;
}

function unchunk(body: Uint8Array) {
  const parts: Uint8Array[] = [];
  let at = 0;
  while (at < body.length) {
    const lineEnd = body.indexOf(13, at);
    const size = parseInt(new TextDecoder().decode(body.subarray(at, lineEnd)), 16);
    if (!size) break;
    parts.push(body.subarray(lineEnd + 2, lineEnd + 2 + size));
    at = lineEnd + 2 + size + 2;
  }
  const joined = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  parts.reduce((offset, part) => (joined.set(part, offset), offset + part.length), 0);
  return joined;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
export const decodeEntities = (text: string) =>
  text.replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (entity, name: string) => {
    if (name[0] !== "#") return ENTITIES[name.toLowerCase()] ?? entity;
    return String.fromCodePoint(
      name[1] === "x" || name[1] === "X" ? parseInt(name.slice(2), 16) : Number(name.slice(1)),
    );
  });

const seconds = (duration: string) => {
  const [, h, m, s] = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/) ?? [];
  return Number(h ?? 0) * 3600 + Number(m ?? 0) * 60 + Number(s ?? 0);
};

// Read the data of one video page. The description in the structured data has no line breaks, so it comes from the page.
export function parseVideoPage(html: string) {
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1] ?? "{}");
  const description = html.match(/<p id="description">([\s\S]*?)<\/p>/)?.[1] ?? "";
  const tags = [...(html.match(/>\s*Tags\s*(<[\s\S]*?)<\/div>/)?.[1] ?? "").matchAll(/<span[^>]*>([^<]+)<\/span>/g)]
    .map((match) => decodeEntities(match[1].trim()));
  // The first link to a channel page is the channel of the video.
  const channel = html.match(/href="https:\/\/www\.theasmrindex\.com\/channel\/(UC[\w-]+)"[^>]*title="View ([^"]*)"/);
  return {
    title: ld.name ?? null,
    description: decodeEntities(description.replace(/<br\s*\/?>\n?/g, "\n").replace(/<[^>]+>/g, "")).trim(),
    upload_date: ld.uploadDate ?? null,
    duration: ld.duration ? seconds(ld.duration) : null,
    tags,
    channel: channel ? decodeEntities(channel[2]) : null,
    channel_id: channel?.[1] ?? null,
  };
}

if (import.meta.main) {
  const [pagesWarc, imagesWarc] = Deno.args;
  if (!pagesWarc || !imagesWarc) throw new Error("Usage: import-asmrindex <pages.warc.gz> <images.warc.gz>");
  Deno.mkdirSync(OUT, { recursive: true });
  Deno.mkdirSync(THUMBS, { recursive: true });
  const decoder = new TextDecoder();
  const removed = new Set<string>();
  const videos = new Map<string, Response>();
  for (const response of responses(Deno.readFileSync(pagesWarc))) {
    if (/\/channel\/[\w-]+\/removed/.test(response.url)) {
      for (
        const [, id] of decoder.decode(response.body).matchAll(
          /href="https:\/\/www\.theasmrindex\.com\/video\/([\w-]{11})"/g,
        )
      ) {
        removed.add(id);
      }
    }
    const id = response.url.match(/\/video\/([\w-]{11})$/)?.[1];
    if (id) videos.set(id, response);
  }
  for (const [id, response] of videos) {
    const data = {
      id,
      ...parseVideoPage(decoder.decode(response.body)),
      removed: removed.has(id),
      url: `${SITE}/video/${id}`,
      captured: response.date,
    };
    Deno.writeTextFileSync(`${OUT}/${id}.json`, JSON.stringify(data, null, 2) + "\n");
  }
  // Only removed videos need the thumbnail of the index. Fetch downloads a larger one for the other videos.
  let thumbs = 0;
  for (const response of responses(Deno.readFileSync(imagesWarc))) {
    const id = response.url.match(/\/uploads\/thumbs\/([\w-]{11})\.jpg/)?.[1];
    const path = `${THUMBS}/${id}.jpg`;
    if (!id || !removed.has(id)) continue;
    try {
      Deno.statSync(path);
    } catch {
      Deno.writeFileSync(path, response.body);
      thumbs++;
    }
  }
  console.log(`${videos.size} videos, ${removed.size} marked as removed, ${thumbs} new thumbnails.`);
}
