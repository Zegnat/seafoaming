// A small client for WebDriver BiDi, the remote control protocol of Firefox.
// Firefox listens when it starts with --remote-debugging-port; this connects to ws://127.0.0.1:<port>/session.
// Send a command and wait for the answer with the same id.
export async function connect(url: string) {
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

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Some lists, such as the releases of an artist, only exist after the page ran its JavaScript, so they need a
// browser. Returns the IDs of the links to kind ("album", "episode") on the page. id is the pattern of an ID; a
// name may come between the kind and the ID, as in music.apple.com/us/album/<name>/<id>.
export async function links(browser: string, url: string, kind: string, id = "[A-Za-z0-9]{22}") {
  const { socket, send } = await connect(browser);
  await send("session.new", { capabilities: {} });
  const context = (await send("browsingContext.create", { type: "tab" })).result.context;
  const evaluate = async (expression: string) =>
    (await send("script.evaluate", { expression, target: { context }, awaitPromise: true })).result?.result?.value;
  await send("browsingContext.navigate", { context, url, wait: "complete" });
  // The list is virtual: only the releases near the visible part exist in the page. Scroll the largest scroll
  // container one screen at a time and collect the links at every step, until the end of the list.
  const scroller =
    `[...document.querySelectorAll("*")].reduce((a, b) => b.scrollHeight - b.clientHeight > a.scrollHeight - a.clientHeight ? b : a)`;
  // The page renders the list a moment after it loads.
  for (let i = 0; i < 40 && !(await evaluate(`document.querySelectorAll('a[href*="/${kind}/"]').length`)); i++) {
    await pause(500);
  }
  const ids = new Set<string>();
  for (let still = 0, rounds = 0; still < 3 && rounds < 1000; rounds++) {
    const found: string[] = JSON.parse(
      await evaluate(
        `JSON.stringify([...document.querySelectorAll('a[href*="/${kind}/"]')].map((a) => a.href.match(/${kind}\\/(?:[^/?]+\\/)*?(${id})(?:[/?#]|$)/)?.[1]).filter(Boolean))`,
      ),
    );
    for (const id of found) ids.add(id);
    // Some pages, such as a Spotify show, have a button for more instead of an endless list.
    const more = await evaluate(
      `(() => { const b = [...document.querySelectorAll("button")].find((b) => /^load more/i.test(b.textContent.trim())); b?.click(); return !!b; })()`,
    );
    const moved = more || !await evaluate(
      `(() => { const s = ${scroller}; const before = s.scrollTop; s.scrollTop += s.clientHeight * 0.8; return s.scrollTop === before; })()`,
    );
    // At the end, the page may still load more; stop after a few steps without movement.
    still = moved ? 0 : still + 1;
    await pause(700);
  }
  await send("browsingContext.close", { context });
  await send("session.end", {});
  socket.close();
  return [...ids];
}
