# Seafoam Wiki

A fan wiki about the videos and characters of [Seafoam Kitten ASMR](https://www.youtube.com/@SeafoamKitten). [Zola](https://www.getzola.org/) builds the site from Markdown files.

## Requirements

- [mise](https://mise.jdx.dev/) installs Zola, [prek](https://prek.j178.dev/) and [yt-dlp](https://github.com/yt-dlp/yt-dlp) from `mise.toml`. Run `mise install` once.
- `curl` and Python 3 download the thumbnails and convert the YouTube data.
- yt-dlp needs a JavaScript runtime, for example [Deno](https://deno.com/), to read YouTube.

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
   mise exec -- scripts/fetch.sh
   ```

2. Generate the pages from the downloaded data in `.cache/`.

   ```sh
   scripts/generate.py
   ```

The fetch script needs some hours for the full channel, because it waits between requests to YouTube.

## Build the site

```sh
mise exec -- zola serve
```

## Check the Markdown

```sh
mise exec -- prek install
mise exec -- prek run --all-files
```
