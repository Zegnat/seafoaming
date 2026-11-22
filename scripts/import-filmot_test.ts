import { parseFilmotPage } from "./import-filmot.ts";

function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`);
  }
}

Deno.test("parseFilmotPage reads the title, channel, date and likes", () => {
  const html = `<script defer> window.queryParameters = {"videoID":"BVKI1LoTaYI","languageA":""}</script>
    <div class="col-6"> ASMR | Man &amp; brushes<a href="https://youtube.com/watch?v=BVKI1LoTaYI" target="_blank">
    <span class="badge">YouTube</span></a> <br> People &amp; Blogs&nbsp; 14.2K views 1,298 likes  44 dislikes
    &nbsp; 25 Aug 2017  </div> <div class="col-3">  <a rel="nofollow" href="/channel/UCrLy10qSZJWqlp3opaIydfw/0/Substance+ASMR">`;
  equal(parseFilmotPage(html), {
    id: "BVKI1LoTaYI",
    title: "ASMR | Man & brushes",
    upload_date: "2017-08-25T00:00:00.000Z",
    like_count: 1298,
    channel: "Substance ASMR",
    channel_id: "UCrLy10qSZJWqlp3opaIydfw",
    url: "https://filmot.com/video/BVKI1LoTaYI",
  });
});
