# Seafoam Wiki

A fan wiki about the videos and characters of [Seafoam Kitten ASMR](https://www.youtube.com/@SeafoamKitten). [Zola](https://www.getzola.org/) builds the site from Markdown files.

## Requirements

- [mise](https://mise.jdx.dev/) installs Zola, [prek](https://prek.j178.dev/), [yt-dlp](https://github.com/yt-dlp/yt-dlp) and [Deno](https://deno.com/) from `mise.toml`. Run `mise install` once.
- The scripts in `scripts/` are TypeScript, and Deno runs them.
- On Alpine Linux, the Deno release of mise does not run, because it needs glibc. Install Deno with `apk add deno`, and put `disable_tools = ["deno"]` under `[settings]` in `mise.local.toml`.

## Content

| Folder                | Contents                               | Source               |
| --------------------- | -------------------------------------- | -------------------- |
| `content/videos/`     | One page for each video and short      | Generated            |
| `content/streams/`    | One page for each live stream recording | Generated            |
| `content/playlists/`  | One page for each playlist             | Generated            |
| `content/characters/` | One page for each character            | Written by hand      |
| `static/thumbs/`      | Video thumbnails                       | Downloaded           |

Do not edit the generated pages, because the next update overwrites them. Put all knowledge about characters on the character pages.

To link a character to a video, add the video ID to the `videos` list in the front matter of the character page. The video page then shows the character, and the character page shows the video.

## Update the YouTube data

1. Download the metadata, captions, playlists and thumbnails. The videos are not downloaded.

   ```sh
   mise exec -- deno task fetch
   ```

2. Generate the pages from the downloaded data in `.cache/`.

   ```sh
   mise exec -- deno task generate
   ```

The fetch script only downloads videos that are not in `.cache/` yet. To download all videos again, for example for new view counts, run `deno task fetch --refresh`. The fetch script waits between requests, so a refresh of the full channel needs some hours. If YouTube reports a rate limit, wait one hour and run the fetch script again.

Some videos are age-restricted, and YouTube shows them only to a logged-in account. The fetch script gives other arguments to yt-dlp, so you can use the cookies of your browser:

```sh
mise exec -- deno task fetch --cookies-from-browser firefox
```

## Build the site

```sh
mise exec -- zola serve
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
