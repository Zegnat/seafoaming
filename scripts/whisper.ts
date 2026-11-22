// Transcribe videos without English captions from YouTube with Whisper, as speech recognition on the audio.
// whisper-cli comes from the whisper distrobox (see ~/Projects/distroboxes/whisper.ini), and the model from
// ~/.local/share/whisper-models.
// Usage: deno task whisper [video IDs]
//   Without IDs, it takes the videos with a named character (content/characters) that have no English captions.
//   It skips videos that already have a transcript in .cache/whisper/transcripts.
import { parse as parseToml } from "@std/toml";
import { subtitleFile } from "./generate.ts";

const ROOT = new URL("..", import.meta.url).pathname;
const OUT = `${ROOT}.cache/whisper`;
const MODEL = `${Deno.env.get("HOME")}/.local/share/whisper-models/ggml-large-v3-turbo.bin`;

const exists = (path: string) => {
  try {
    Deno.statSync(path);
    return true;
  } catch {
    return false;
  }
};

async function run(command: string, args: string[]) {
  const { code, stderr } = await new Deno.Command(command, { args, stdout: "null", stderr: "piped" }).output();
  if (code !== 0) throw new Error(`${command} failed: ${new TextDecoder().decode(stderr).trim().split("\n").at(-1)}`);
}

// The videos of the character pages.
function characterVideos() {
  const ids = new Set<string>();
  for (const entry of Deno.readDirSync(`${ROOT}content/characters`)) {
    if (!entry.name.endsWith(".md") || entry.name === "_index.md") continue;
    // deno-lint-ignore no-explicit-any
    const front = parseToml(Deno.readTextFileSync(`${ROOT}content/characters/${entry.name}`).split("+++")[1]) as any;
    for (const id of front.extra?.videos ?? []) ids.add(id);
  }
  return [...ids];
}

if (import.meta.main) {
  const ids = Deno.args.length ? Deno.args : characterVideos().filter((id) => {
    const path = `${ROOT}.cache/videos/${id}.info.json`;
    return exists(path) && !subtitleFile(JSON.parse(Deno.readTextFileSync(path)))[0];
  });
  Deno.mkdirSync(`${OUT}/audio`, { recursive: true });
  Deno.mkdirSync(`${OUT}/transcripts`, { recursive: true });
  const todo = ids.filter((id) => !exists(`${OUT}/transcripts/${id}.vtt`));
  console.log(`${todo.length} of ${ids.length} videos need a transcript.`);
  for (const [i, id] of todo.entries()) {
    const audio = `${OUT}/audio/${id}`;
    try {
      // Low-quality audio is enough for speech recognition.
      await run("yt-dlp", [
        "--quiet",
        "--no-warnings",
        "--preset-alias",
        "sleep",
        "-f",
        "worstaudio",
        "-o",
        `${audio}.%(ext)s`,
        `https://www.youtube.com/watch?v=${id}`,
      ]);
      const download = [...Deno.readDirSync(`${OUT}/audio`)].find((e) => e.name.startsWith(`${id}.`))!.name;
      // whisper-cli reads 16 kHz mono WAV.
      await run("ffmpeg", [
        "-nostdin",
        "-loglevel",
        "error",
        "-y",
        "-i",
        `${OUT}/audio/${download}`,
        "-ar",
        "16000",
        "-ac",
        "1",
        `${audio}.wav`,
      ]);
      // All videos are in English, whatever YouTube says. Without context from the previous text, Whisper does not
      // repeat a line through the long stretches of ASMR sounds; without non-speech tokens, it writes no "*Sigh*".
      await run("whisper-cli", [
        "-m",
        MODEL,
        "-l",
        "en",
        "--max-context",
        "0",
        "--suppress-nst",
        "-ovtt",
        "-of",
        `${OUT}/transcripts/${id}`,
        "-f",
        `${audio}.wav`,
      ]);
      console.log(`${i + 1}/${todo.length} ${id}`);
    } catch (error) {
      console.log(`${i + 1}/${todo.length} ${id}: ${(error as Error).message}`);
    } finally {
      for (const e of [...Deno.readDirSync(`${OUT}/audio`)].filter((e) => e.name.startsWith(`${id}.`))) {
        Deno.removeSync(`${OUT}/audio/${e.name}`);
      }
    }
  }
}
