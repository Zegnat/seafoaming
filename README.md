# Seafoam Wiki

A fan wiki about the videos and characters of [Seafoam Kitten ASMR](https://www.youtube.com/@SeafoamKitten). [Zola](https://www.getzola.org/) builds the site from Markdown files.

## Requirements

- [mise](https://mise.jdx.dev/) installs Zola, [prek](https://prek.j178.dev/), [yt-dlp](https://github.com/yt-dlp/yt-dlp) and [Deno](https://deno.com/) from `mise.toml`. Run `mise install` once.
- The scripts in `scripts/` are TypeScript, and Deno runs them.
- On Alpine Linux, the Deno release of mise does not run, because it needs glibc. Install Deno with `apk add deno`, and put `disable_tools = ["deno"]` under `[settings]` in `mise.local.toml`.

## Content

| Folder                | Contents                               | Source               |
| --------------------- | -------------------------------------- | -------------------- |
| `content/videos/`     | One page for each video                | Generated            |
| `content/shorts/`     | One page for each short                | Generated            |
| `content/streams/`    | One page for each live stream recording | Generated            |
| `content/playlists/`  | One page for each playlist             | Generated            |
| `content/characters/` | One page for each character            | Written by hand      |
| `static/thumbs/`      | Video thumbnails as WebP               | Generated            |

Do not edit the generated pages, because the next update overwrites them. Put all knowledge about characters on the character pages.

To link a character to a video, add the video ID to the `videos` list in the front matter of the character page. The video page then shows the character, and the character page shows the video.

## Update the YouTube data

1. Download the metadata, captions, playlists and the best available thumbnails into `.cache/`. The videos are not downloaded. The script also checks again the videos that YouTube no longer lists, and saves why they are gone in `.cache/status/`.

   ```sh
   mise exec -- deno task fetch
   ```

2. Generate the pages from the downloaded data in `.cache/`. This step also makes the WebP thumbnails in `static/thumbs/` and a small blurred placeholder for each video.

   ```sh
   mise exec -- deno task generate
   ```

The fetch script only downloads videos that are not in `.cache/` yet. To download all videos again, for example for new view counts, run `deno task fetch --refresh`. The fetch script waits between requests, so a refresh of the full channel needs some hours. If YouTube reports a rate limit, wait one hour and run the fetch script again.

Some videos are age-restricted, and YouTube shows them only to a logged-in account. The fetch script gives other arguments to yt-dlp, so you can use the cookies of your browser:

```sh
mise exec -- deno task fetch --cookies-from-browser firefox
```

## Build the site

To preview the site while you edit it, run the command below. The preview keeps its files in `.cache/serve/`. Do not use `public/` for it, because `deno task build` writes the production files there, and the preview would then sometimes show those.

```sh
mise exec -- deno task serve
```

To build the site for publication, run the command below. Zola builds the site into `public/`, compiles the stylesheet from `sass/` and minifies the HTML. Then `scripts/build.ts` combines all stylesheets into one minified `style.css` and all scripts into one minified `site.js`, with the license notices of the vendored code. The preview loads the separate files, so they stay easy to debug.

```sh
mise exec -- deno task build
```

## Check the files

The prek hooks format and lint the Markdown and the TypeScript.

```sh
mise exec -- prek install
mise exec -- prek run --all-files
mise exec -- deno task test
```

## Licenses

The repository follows the [REUSE specification](https://reuse.software/). `REUSE.toml` gives the license of each file, and `LICENSES/` holds the license texts.

- The code is available under 0BSD.
- The original content is available under CC BY 4.0.
- The material from YouTube belongs to Seafoam Kitten ASMR. The licenses of this repository do not apply to it.
