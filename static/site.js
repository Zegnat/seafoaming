// Preload the hover snapshots of a thumbnail after the thumbnail itself loaded, on devices that can hover and without Save-Data.
if (matchMedia("(hover: hover)").matches && !navigator.connection?.saveData) {
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
const thumbFor = (url) => url && document.querySelector(`a.thumb[href="${CSS.escape(url)}"] img`);
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
