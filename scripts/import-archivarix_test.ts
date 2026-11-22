import { parseArchivarixPage } from "./import-archivarix.ts";

function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`);
  }
}

Deno.test("parseArchivarixPage reads the metadata, description and tags", () => {
  const copy =
    '<button type="button" class="x" title="Copy" aria-label="Copy"><svg viewBox="0 0 16 16"></svg></button>';
  const html = `<div><div class="t">ASMR | Man &amp; brushes</div>${copy}</div>
    <div><span>SafetymanD</span>${copy}<span class="c">(UCrLy10qSZJWqlp3opaIydfw)</span>${copy}</div>
    <div><span>https://youtube.com/watch?v=BVKI1LoTaYI</span>${copy}</div>
    <div><span>Uploaded: 2017-08-25</span><span>Duration: 1:16:04</span><span>Views: 14,987</span></div>
    <details><summary class="s">Description</summary><pre class="p">First line

Second &amp; last</pre></details><div><h3 class="h">Tags</h3><div><span class="g">ASMR</span><span>Ear to ear</span></div></div>`;
  equal(parseArchivarixPage(html), {
    id: "BVKI1LoTaYI",
    title: "ASMR | Man & brushes",
    description: "First line\n\nSecond & last",
    upload_date: "2017-08-25T00:00:00.000Z",
    duration: 4564,
    view_count: 14987,
    tags: ["ASMR", "Ear to ear"],
    channel: "SafetymanD",
    channel_id: "UCrLy10qSZJWqlp3opaIydfw",
    url: "https://tube.archivarix.net/find-reupload/BVKI1LoTaYI",
  });
});
