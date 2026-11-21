// Make the WebP versions of the thumbnails for the site from the originals in .cache/thumbs.
import sharp from "sharp";
import { encodeBase64 } from "@std/encoding/base64";
import { rgbaToThumbHash, thumbHashToRGBA } from "thumbhash";

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

// Write the thumbnail and the snapshots of a video, 320 and 640 pixels wide.
// Return a blurred placeholder as a data URI. It is a ThumbHash, decoded at build time into a 32x18 WebP image,
// so the page needs no JavaScript to show it.
// folder is a subfolder of static/thumbs, for example "others" for videos of other channels.
export async function thumbnail(id: string, folder = ""): Promise<string | null> {
  const out = folder ? `${OUT}/${folder}` : OUT;
  const source = `${ORIGINALS}/${id}.jpg`;
  if (!exists(source)) return null;
  Deno.mkdirSync(out, { recursive: true });
  await resize(source, `${out}/${id}-320.webp`, 320);
  await resize(source, `${out}/${id}-640.webp`, 640);
  for (const n of [1, 2, 3]) {
    const snapshot = `${ORIGINALS}/${id}-${n}.jpg`;
    if (!exists(snapshot)) continue;
    await resize(snapshot, `${out}/${id}-${n}-320.webp`, 320);
    await resize(snapshot, `${out}/${id}-${n}-640.webp`, 640);
  }
  // ThumbHash takes images of at most 100 by 100 pixels.
  const small = await sharp(source).resize(100, 56, { fit: "cover" }).ensureAlpha().raw().toBuffer({
    resolveWithObject: true,
  });
  const { w, h, rgba } = thumbHashToRGBA(rgbaToThumbHash(small.info.width, small.info.height, small.data));
  const blurred = await sharp(rgba, { raw: { width: w, height: h, channels: 4 } }).removeAlpha().webp({ quality: 50 })
    .toBuffer();
  return `data:image/webp;base64,${encodeBase64(blurred)}`;
}
