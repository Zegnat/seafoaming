import { classify, parseCommunity, parseVtt, timestamp, toVtt } from "./generate.ts";

function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`);
  }
}

Deno.test("parseVtt drops the repeated lines of rolling captions", () => {
  const vtt = `WEBVTT

00:00:00.080 --> 00:00:03.909 align:start position:0%
${" "}
I<00:00:00.320><c> know</c>

00:00:03.909 --> 00:00:03.919 align:start position:0%
I know

00:00:03.919 --> 00:00:06.070 align:start position:0%
I know
you&#39;re<00:00:04.240><c> here &amp; there</c>
`;
  equal(parseVtt(vtt), [[0.08, "I know"], [3.919, "you're here & there"]]);
});

Deno.test("timestamp adds hours only when needed", () => {
  equal([timestamp(42), timestamp(754.9), timestamp(3725)], ["0:42", "12:34", "1:02:05"]);
});

Deno.test("classify turns YouTube errors into statuses", () => {
  equal(
    [
      "Video unavailable. This video is private",
      "Video unavailable. This video has been removed by the uploader",
      "This video has been removed for violating YouTube's Terms of Service",
      "Sign in to confirm your age. This video may be inappropriate for some users.",
      "Join this channel to get access to members-only content like this video, and other exclusive perks.",
      "Video unavailable",
    ].map(classify),
    [
      { status: "private", by: null },
      { status: "removed", by: "uploader" },
      { status: "removed", by: "YouTube" },
      null,
      { status: "members-only", by: null },
      { status: "unavailable", by: null },
    ],
  );
});

Deno.test("parseCommunity splits data and notes", () => {
  const text = `+++
spotify = "https://open.spotify.com/episode/1"
apple_music = ""
+++

Recorded in the new studio.
`;
  equal(parseCommunity(text), {
    data: { spotify: "https://open.spotify.com/episode/1", apple_music: "" },
    notes: "Recorded in the new studio.",
  });
  equal(parseCommunity("Only notes."), { data: {}, notes: "Only notes." });
  equal(parseCommunity("+++\n+++\n\nEmpty front matter."), { data: {}, notes: "Empty front matter." });
});

Deno.test("parseVtt reads times without hours", () => {
  const vtt = "WEBVTT\n\n00:30.000 --> 00:34.200\nOh yes\n\n01:02:03.500 --> 01:02:04.000\nLater\n";
  equal(parseVtt(vtt), [[30, "Oh yes"], [3723.5, "Later"]]);
});

Deno.test("toVtt writes lines that parseVtt reads back the same", () => {
  const lines: [number, string][] = [[0.08, "I know"], [3.919, "you're <here> & there"], [3725.5, "an hour later"]];
  equal(parseVtt(toVtt(lines)), lines);
});
