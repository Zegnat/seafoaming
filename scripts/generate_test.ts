import { parseVtt, timestamp } from "./generate.ts";

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
