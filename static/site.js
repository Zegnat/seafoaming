// Preload the hover snapshots of a thumbnail after the thumbnail itself loaded, on devices that can hover and without Save-Data.
// any-hover, not hover: on devices with a touchscreen and a trackpad or mouse, the touchscreen is the primary input.
if (matchMedia("(any-hover: hover)").matches && !navigator.connection?.saveData) {
  const preload = (img) => {
    for (const url of img.parentElement.dataset.previews.split(" ")) {
      const image = new Image();
      image.fetchPriority = "low";
      image.src = url;
    }
  };
  addEventListener("DOMContentLoaded", () => {
    for (const img of document.querySelectorAll(".thumb[data-previews] img")) {
      if (img.complete && img.naturalWidth) preload(img);
      else img.addEventListener("load", () => preload(img), { once: true });
    }
  });
}
// The infobox thumbnail is named "thumb" in CSS. Give the thumbnail that links to the other page the same name, so it moves between the pages.
// Compare the resolved href, because the attribute holds a relative URL.
const thumbFor = (url) =>
  url && [...document.querySelectorAll("a.thumb")].find((a) => a.href === url)?.querySelector("img");
const nameDuring = (img, transition, done) => {
  if (!img) return;
  img.style.viewTransitionName = "thumb";
  transition[done].then(() => img.style.viewTransitionName = "");
};
addEventListener(
  "pageswap",
  (e) => e.viewTransition && nameDuring(thumbFor(e.activation?.entry?.url), e.viewTransition, "finished"),
);
addEventListener(
  "pagereveal",
  (e) => e.viewTransition && nameDuring(thumbFor(navigation.activation?.from?.url), e.viewTransition, "ready"),
);

// lite-youtube-embed opens connections to YouTube and to Google ad servers when the pointer moves over the player.
// Marking them as done stops that, so the page contacts no other website before the visitor starts a video.
customElements.whenDefined("lite-youtube").then(() => customElements.get("lite-youtube").preconnected = true);

// Open chapter and transcript links of the current video in the embedded player instead of on YouTube.
// Without JavaScript, or with a modifier key, the links still go to YouTube.
const YOUTUBE = "https://www.youtube-nocookie.com";
const PAUSED = 2;
const BUFFERING = 3;
const states = new WeakMap();
// YouTube only reports the player state to the page that the origin parameter names.
addEventListener("DOMContentLoaded", () => {
  for (const player of document.querySelectorAll("lite-youtube")) {
    player.setAttribute(
      "params",
      `${player.getAttribute("params") ?? ""}&origin=${encodeURIComponent(location.origin)}`,
    );
  }
});
// After a "listening" message, the iframe sends its state with every change. Like the YouTube API, send it again
// every 250 milliseconds until the player answers, because the player inside the iframe starts after the load event.
// The load event of an element does not reach window, so the listener is on document.
document.addEventListener("load", (event) => {
  const frame = event.target;
  if (!frame.matches?.("lite-youtube iframe")) return;
  let tries = 0;
  const timer = setInterval(() => {
    if (states.has(frame) || ++tries > 20) return clearInterval(timer);
    frame.contentWindow.postMessage(JSON.stringify({ event: "listening", id: 1, channel: "widget" }), YOUTUBE);
  }, 250);
}, true);
addEventListener("message", (event) => {
  if (event.origin !== YOUTUBE) return;
  let state;
  try {
    state = JSON.parse(event.data)?.info?.playerState;
  } catch {
    return;
  }
  const frame = [...document.querySelectorAll("lite-youtube iframe")].find((f) => f.contentWindow === event.source);
  // Buffering (3) says nothing about play or pause, so keep the state from before it.
  if (frame && state !== undefined && state !== BUFFERING) states.set(frame, state);
});
const command = (frame, func, args = []) =>
  frame.contentWindow.postMessage(JSON.stringify({ event: "command", func, args }), YOUTUBE);
// Jump to the time. A paused video stays paused; a video that has not started yet starts at the time.
const seek = async (player, seconds) => {
  if (!player.classList.contains("lyt-activated")) {
    player.setAttribute("params", `${player.getAttribute("params") ?? ""}&start=${seconds}`);
    return player.activate();
  }
  // Safari and mobile browsers get the API player of lite-youtube-embed.
  if (player.needsYTApi) {
    const youtube = await player.getYTPlayer();
    const paused = youtube.getPlayerState() === PAUSED;
    youtube.seekTo(seconds, true);
    if (!paused) youtube.playVideo();
    return;
  }
  // Other browsers get a plain iframe; enablejsapi=1 lets it take commands through postMessage.
  const frame = player.querySelector("iframe");
  const paused = states.get(frame) === PAUSED;
  command(frame, "seekTo", [seconds, true]);
  if (!paused) command(frame, "playVideo");
};
addEventListener("click", (event) => {
  const link = event.target.closest?.('a[href*="youtube.com/watch"]');
  const player = document.querySelector("lite-youtube");
  if (!link || !player?.activate || event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return;
  }
  const url = new URL(link.href);
  if (url.searchParams.get("v") !== player.getAttribute("videoid") || !url.searchParams.has("t")) return;
  event.preventDefault();
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  player.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "nearest" });
  seek(player, parseInt(url.searchParams.get("t")));
});

// Open a collapsed section when a link leads into it, for example from the table of contents.
const openTarget = (hash) => {
  const target = hash.length > 1 && document.getElementById(decodeURIComponent(hash.slice(1)));
  if (target) target.closest("details")?.setAttribute("open", "");
};
addEventListener("click", (event) => {
  const link = event.target.closest?.('a[href^="#"]');
  if (link) openTarget(link.hash);
});
addEventListener("DOMContentLoaded", () => openTarget(location.hash));
