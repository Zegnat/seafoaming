import { isTwin, toAlbum } from "./apple.ts";

function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`);
  }
}

const collection = {
  collectionId: 1640000000,
  collectionName: "OILY EAR MASSAGE - Single",
  releaseDate: "2022-09-02T07:00:00Z",
  copyright: "℗ 2021 Seafoam Kitten's ASMR",
  collectionViewUrl: "https://music.apple.com/us/album/oily-ear-massage-single/1640000000?uo=4",
  artworkUrl100: "https://is1-ssl.mzstatic.com/image/thumb/a/b/100x100bb.jpg",
};
const tracks = [
  { trackId: 2, trackName: "Drifting Off", discNumber: 1, trackNumber: 2, trackTimeMillis: 120400 },
  { trackId: 1, trackName: "Warm Welcome", discNumber: 1, trackNumber: 1, trackTimeMillis: 60000 },
];

Deno.test("toAlbum reads the release, its type and its tracks in order", () => {
  equal(toAlbum(collection, tracks), {
    id: "1640000000",
    name: "OILY EAR MASSAGE",
    type: "SINGLE",
    date: "2022-09-02",
    copyright: "℗ 2021 Seafoam Kitten's ASMR",
    cover: "https://is1-ssl.mzstatic.com/image/thumb/a/b/600x600bb.jpg",
    url: "https://music.apple.com/us/album/oily-ear-massage-single/1640000000",
    tracks: [
      { id: "1", name: "Warm Welcome", number: 1, duration: 60 },
      { id: "2", name: "Drifting Off", number: 2, duration: 120 },
    ],
  });
});

Deno.test("isTwin needs about the same length and the same tracks or name", () => {
  const apple = toAlbum(collection, tracks);
  const spotify = { ...apple, id: "s", name: "Oily Ear Massage!" };
  equal(isTwin(apple, spotify), true);
  equal(
    isTwin(apple, { ...spotify, name: "Other", tracks: [{ id: "x", name: "Other", number: 1, duration: 180 }] }),
    false,
  );
  equal(isTwin(apple, { ...spotify, tracks: spotify.tracks.map((t) => ({ ...t, duration: t.duration + 10 })) }), false);
});
