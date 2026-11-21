// After `zola build`, combine and minify the stylesheets and scripts in public/ into one style.css and one site.js.
// The templates load only these two files when Zola runs in build mode.
import * as esbuild from "esbuild";

// The output folder of `zola build`, public/ unless given as an argument.
const PUBLIC = (Deno.args[0] ?? new URL("../public", import.meta.url).pathname).replace(/\/?$/, "/");

// Minifiers remove normal comments, so the notices of the vendored code go in a comment that esbuild keeps.
const NOTICES: Record<string, string> = {
  "vendor/aria-practices/sortable-table.js":
    "sortable-table.js of the WAI-ARIA Authoring Practices, https://www.w3.org/WAI/ARIA/apg/\n *   Copyright World Wide Web Consortium, W3C Software and Document License,\n *   https://www.w3.org/Consortium/Legal/2015/copyright-software-and-document",
  "vendor/lite-youtube-embed/":
    "lite-youtube-embed, https://github.com/paulirish/lite-youtube-embed\n *   Copyright 2019 Paul Irish, Apache License 2.0, https://www.apache.org/licenses/LICENSE-2.0",
};

async function bundle(out: string, files: string[], loader: "css" | "js") {
  // Zola starts its CSS with a byte order mark, which breaks a rule in the middle of a file.
  const code = files.map((file) => Deno.readTextFileSync(PUBLIC + file).replace(/^\uFEFF/, "")).join("\n");
  const notices = Object.entries(NOTICES).filter(([path]) => files.some((file) => file.startsWith(path)));
  const banner = `/*!\n * Contains code from:\n${notices.map(([, notice]) => ` * - ${notice}\n`).join("")} */`;
  const result = await esbuild.transform(code, { loader, minify: true, banner });
  Deno.writeTextFileSync(PUBLIC + out, result.code);
  console.log(`${out}: ${files.length} files, ${code.length} to ${result.code.length} bytes`);
}

await bundle("style.css", ["vendor/lite-youtube-embed/lite-yt-embed.css", "style.css"], "css");
await bundle(
  "site.js",
  ["vendor/aria-practices/sortable-table.js", "vendor/lite-youtube-embed/lite-yt-embed.js", "site.js"],
  "js",
);
await esbuild.stop();
