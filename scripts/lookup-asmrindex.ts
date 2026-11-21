// Look up playlist entries that YouTube gives no title for, on The ASMR Index, through a headless Firefox.
// The index is behind a bot check, so plain requests do not work. Start Firefox first, for example:
//   firefox --headless --no-remote --profile <empty folder> --remote-debugging-port=9223
// Then: deno task lookup-asmrindex [ws://127.0.0.1:9223/session]
// Pages saved from a browser work too: deno task lookup-asmrindex <folder with .html files>
// A Firefox that you use yourself works too, if it was started with --remote-debugging-port; the script opens its own tab.
import { parseVideoPage } from "./import-asmrindex.ts";

const ROOT = new URL("..", import.meta.url).pathname;
const OUT = `${ROOT}.cache/asmrindex`;
const THUMBS = `${ROOT}.cache/thumbs`;
const SITE = "https://www.theasmrindex.com";

const exists = (path: string) => {
  try {
    Deno.statSync(path);
    return true;
  } catch {
    return false;
  }
};

// A small WebDriver BiDi client: send a command and wait for the answer with the same id.
async function connect(url: string) {
  const socket = new WebSocket(url);
  const pending = new Map<number, (message: Record<string, unknown>) => void>();
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    pending.get(message.id)?.(message);
    pending.delete(message.id);
  };
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });
  let next = 0;
  // deno-lint-ignore no-explicit-any
  const send = (method: string, params: unknown): Promise<any> =>
    new Promise((resolve) => {
      const id = ++next;
      pending.set(id, resolve);
      socket.send(JSON.stringify({ id, method, params }));
    });
  return { socket, send };
}

// Save the data of one page of the index, and download its thumbnail if there is none yet.
// The thumbnails are not behind the bot check.
async function save(id: string, html: string, captured: Date) {
  const data = parseVideoPage(html);
  if (!data.title) return null;
  Deno.mkdirSync(OUT, { recursive: true });
  const entry = {
    id,
    ...data,
    removed: /This video seems to be removed from YT/.test(html),
    url: `${SITE}/video/${id}`,
    captured: captured.toISOString(),
  };
  Deno.writeTextFileSync(`${OUT}/${id}.json`, JSON.stringify(entry, null, 2) + "\n");
  if (!exists(`${THUMBS}/${id}.jpg`)) {
    const response = await fetch(`https://i.theasmrindex.com/uploads/thumbs/${id}.jpg`);
    if (response.ok) Deno.writeFileSync(`${THUMBS}/${id}.jpg`, new Uint8Array(await response.arrayBuffer()));
    else await response.body?.cancel();
  }
  return data;
}

// Pages saved from a browser: the canonical link of each page names its video.
async function fromFolder(folder: string) {
  for (const file of Deno.readDirSync(folder)) {
    if (!file.name.endsWith(".html")) continue;
    const path = `${folder}/${file.name}`;
    const html = Deno.readTextFileSync(path);
    const id = html.match(/<link rel="canonical" href="[^"]*\/video\/([\w-]{11})"/)?.[1];
    const data = id && await save(id, html, Deno.statSync(path).mtime ?? new Date());
    console.log(data ? `${id}: ${data.title} (${data.channel})` : `${file.name}: no video data`);
  }
}

if (import.meta.main) {
  const target = Deno.args[0] ?? "ws://127.0.0.1:9223/session";
  if (!target.startsWith("ws")) {
    await fromFolder(target);
    Deno.exit();
  }
  const { socket, send } = await connect(target);
  await send("session.new", { capabilities: {} });
  // Use a new tab, so the script also works with a Firefox that someone is using.
  const context = (await send("browsingContext.create", { type: "tab" })).result.context;
  const open = (url: string) => send("browsingContext.navigate", { context, url, wait: "complete" });
  const evaluate = async (expression: string) =>
    (await send("script.evaluate", { expression, target: { context }, awaitPromise: true })).result?.result?.value;

  // Entries without a title are private or deleted videos. Skip the ones that the index already gave us.
  const ids = new Set<string>();
  for (const entry of Deno.readDirSync(`${ROOT}.cache/playlists`)) {
    const playlist = JSON.parse(Deno.readTextFileSync(`${ROOT}.cache/playlists/${entry.name}`));
    for (const e of playlist.entries ?? []) {
      if (!e.title && !exists(`${OUT}/${e.id}.json`) && !exists(`${ROOT}.cache/videos/${e.id}.info.json`)) {
        ids.add(e.id);
      }
    }
  }
  console.log(`Looking up ${ids.size} videos.`);
  for (const id of ids) {
    await open(`${SITE}/video/${id}`);
    // Wait for the bot check of the site. A block page does not go away by waiting, so stop there.
    let title = "";
    for (let i = 0; i < 20 && /just a moment/i.test(title = await evaluate("document.title")); i++) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    if (/attention required|access denied|just a moment/i.test(title)) {
      console.log(`${id}: the bot protection of the site blocks the browser ("${title}"). Stopping; try again later.`);
      break;
    }
    const data = await save(id, await evaluate("document.documentElement.outerHTML"), new Date());
    console.log(data ? `${id}: ${data.title} (${data.channel})` : `${id}: not on the index`);
    // Go easy on the site.
    await new Promise((resolve) => setTimeout(resolve, 10_000));
  }
  await send("browsingContext.close", { context });
  await send("session.end", {});
  socket.close();
}
