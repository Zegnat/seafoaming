// Make the WebP versions of the thumbnails for the site from the originals in .cache/thumbs.
import sharp from "sharp";
import { encodeBase64 } from "@std/encoding/base64";

const ROOT = new URL("..", import.meta.url).pathname;
const ORIGINALS = `${ROOT}.cache/thumbs`;
const OUT = `${ROOT}static/thumbs`;

function exists(path: string) {
  try {
    Deno.statSync(path);
    return true;
  } catch {
    return false;
  }
}

// Fit to 16:9. "cover" also cuts off the black bars of the 4:3 fallback images.
async function resize(source: string, out: string, width: number) {
  if (exists(out)) return;
  await sharp(source).resize(width, width * 9 / 16, { fit: "cover" }).webp({ quality: 80 }).toFile(out);
}

// Write the thumbnail (320 and 640 pixels wide) and the snapshots (320 pixels wide) of a video.
// Return a 16x9 pixel version of the thumbnail as a data URI, for a blurred placeholder without JavaScript.
export async function thumbnail(id: string): Promise<string | null> {
  const source = `${ORIGINALS}/${id}.jpg`;
  if (!exists(source)) return null;
  Deno.mkdirSync(OUT, { recursive: true });
  await resize(source, `${OUT}/${id}-320.webp`, 320);
  await resize(source, `${OUT}/${id}-640.webp`, 640);
  for (const n of [1, 2, 3]) {
    const snapshot = `${ORIGINALS}/${id}-${n}.jpg`;
    if (exists(snapshot)) await resize(snapshot, `${OUT}/${id}-${n}-320.webp`, 320);
  }
  const tiny = await sharp(source).resize(16, 9, { fit: "cover" }).webp({ quality: 40 }).toBuffer();
  return `data:image/webp;base64,${encodeBase64(tiny)}`;
}
