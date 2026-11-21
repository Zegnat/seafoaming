import { encodeBase64 } from "@std/encoding/base64";
import { matchEpisode, parseAlbumPage, parseEpisodePage, score, setWeights } from "./spotify.ts";

function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`);
  }
}

const state = {
  entities: {
    items: {
      "spotify:album:63ITYGWZdHvy83B7Sf95vM": {
        name: "Oily Massage - Silky Ear Attention",
        type: "EP",
        date: { year: 2026, month: 11, day: 6 },
        copyright: { items: [{ type: "C", text: "2026 ASMRdB" }, { type: "P", text: "2026 ASMRdB" }] },
        coverArt: { sources: [{ url: "small", width: 64 }, { url: "large", width: 640 }] },
        tracksV2: {
          items: [{
            track: { id: "a", name: "Warm Welcome", trackNumber: 1, duration: { totalMilliseconds: 327000 } },
          }],
        },
      },
    },
  },
};
const page = `<script id="initialState" type="text/plain">${
  encodeBase64(new TextEncoder().encode(JSON.stringify(state)))
}</script>`;

Deno.test("parseAlbumPage reads the album from the initial state of the page", () => {
  equal(parseAlbumPage(page, "63ITYGWZdHvy83B7Sf95vM"), {
    id: "63ITYGWZdHvy83B7Sf95vM",
    name: "Oily Massage - Silky Ear Attention",
    type: "EP",
    date: "2026-11-06",
    copyright: "2026 ASMRdB",
    cover: "large",
    tracks: [{ id: "a", name: "Warm Welcome", number: 1, duration: 327 }],
  });
});

Deno.test("score prefers a release with the same length, title words and chapters", () => {
  setWeights(["ASMR Silky Ear Attention", "Ear Attention", "Oily Massage", "Ghost girl haunts you"]);
  const album = parseAlbumPage(page, "63ITYGWZdHvy83B7Sf95vM")!;
  const video = {
    title: "ASMR OILY MASSAGE Silky Ear Attention for DEEP Tingles",
    duration: 330,
    timestamp: Date.parse("2026-10-09") / 1000,
    chapters: [{ title: "Warm welcome" }],
  };
  const other = { title: "Ghost girl haunts you", duration: 1500, timestamp: Date.parse("2020-01-01") / 1000 };
  const good = score(album, video), bad = score(album, other);
  equal([good.title, good.length, good.tracks, good.days], [1, 1, 1, 28]);
  if (bad.score >= good.score) throw new Error("the wrong video scored higher");
});

Deno.test("parseEpisodePage reads the episode and trims its name", () => {
  const episode = {
    name: " Can't Sleep? ",
    releaseDate: { isoString: "2026-09-05T04:40:00Z" },
    duration: { totalMilliseconds: 1616991 },
    description: "When nothing else works",
    coverArt: { sources: [{ url: "small", width: 64 }, { url: "large", width: 640 }] },
  };
  const html = `<script id="initialState" type="text/plain">${
    encodeBase64(new TextEncoder().encode(JSON.stringify({ entities: { items: { "spotify:episode:e": episode } } })))
  }</script>`;
  equal(parseEpisodePage(html, "e"), {
    id: "e",
    name: "Can't Sleep?",
    date: "2026-09-05",
    duration: 1617,
    description: "When nothing else works",
    cover: "large",
  });
});

Deno.test("matchEpisode takes the video of the same length whose title the episode carries", () => {
  setWeights(["Sleep Clinic", "Fox Girl Tea", "Oily Ear Massage"]);
  const videos = [
    { id: "a", title: "Fox Girl Tea", duration: 1000, timestamp: 0, description: "" },
    { id: "b", title: "Oily Ear Massage", duration: 1001, timestamp: 0, description: "" },
    { id: "c", title: "Sleep Clinic", duration: 2000, timestamp: 0, description: "" },
  ];
  const episode = {
    id: "e",
    name: "junk ASMR Oily Ear Massage",
    date: "2026-01-01",
    duration: 1000,
    description: "",
    cover: null,
  };
  const match = matchEpisode(episode, videos);
  equal([match?.video.id, match?.clear, match?.candidates], ["b", true, 2]);
  equal(matchEpisode({ ...episode, duration: 3000 }, videos), null);
});
