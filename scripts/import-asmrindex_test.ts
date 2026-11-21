import { decodeEntities, parseVideoPage } from "./import-asmrindex.ts";

function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`);
  }
}

Deno.test("decodeEntities handles named and numeric entities", () => {
  equal(decodeEntities("Kitten&#039;s &amp; &quot;Honey&quot; &#x1F496;"), `Kitten's & "Honey" 💖`);
});

Deno.test("parseVideoPage reads the structured data and the description with line breaks", () => {
  const html = `<script type="application/ld+json">{"name": "ASMR Test", "uploadDate": "2024-05-10T18:28:01+00:00",
    "duration": "PT1H2M3S", "description": "no line breaks"}</script>
    <div class="video-desc"><p id="description">First line<br />
<br />
Second &amp; last</p></div>
    <div> Tags <span class="tag">asmr</span><span class="tag">ear eating</span></div>
    <a href="https://www.theasmrindex.com/channel/UCBRuxya3juxDB1SOg-QOBpg" title="View Seafoam Kitten&#039;s ASMR">`;
  equal(parseVideoPage(html), {
    title: "ASMR Test",
    description: "First line\n\nSecond & last",
    upload_date: "2024-05-10T18:28:01+00:00",
    duration: 3723,
    tags: ["asmr", "ear eating"],
    channel: "Seafoam Kitten's ASMR",
    channel_id: "UCBRuxya3juxDB1SOg-QOBpg",
  });
});
