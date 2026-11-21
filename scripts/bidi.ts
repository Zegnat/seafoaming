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
