+++
title = "Copyright"
+++

This is a fan site. It is not affiliated with Seafoam Kitten ASMR.

The [source repository](https://github.com/Zegnat/seafoaming) follows the [REUSE specification](https://reuse.software/). The file `REUSE.toml` gives the copyright and license of each file. The folder `LICENSES/` holds the full license texts.

## Original content

The community writes the original content of this site. Examples are the character pages, the introductions of the sections and the notes on the video pages. This content is available under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), the Creative Commons Attribution 4.0 International License. If you give credit to the Seafoam Kitten ASMR Community and link to this site, you can copy, change and share it.

## Material from YouTube

The videos belong to [Seafoam Kitten ASMR](https://www.youtube.com/@SeafoamKitten). So does the material that YouTube gives about them: the titles, descriptions, chapter titles, captions, playlist data, thumbnails and snapshots. The licenses of this site do not apply to this material.

- The transcripts come from the captions on YouTube. Most of them are automatic captions that YouTube made with speech recognition, so they contain errors.
- The site shows the thumbnails and snapshots in smaller WebP versions. The blurred placeholders are made from the thumbnails too.
- The reasons why a video is unavailable are quoted from YouTube.
- Some playlists, such as Favorite ASMR, also hold videos of other channels. Their titles and thumbnails belong to the creators of those videos.
- Some videos were removed before the wiki started. Their pages use the titles, descriptions and thumbnails that [The ASMR Index](https://www.theasmrindex.com/) kept. These pages say so at the top.

## Software

- The code of the site, for example the templates, scripts and stylesheet, is available under the [Zero-Clause BSD License (0BSD)](https://opensource.org/license/0bsd).
- The icons are from [Tabler Icons](https://tabler.io/icons), copyright 2020-2026 Paweł Kuna, under the [MIT License](https://github.com/tabler/tabler-icons/blob/main/LICENSE). The repository contains the icon files unchanged.
- The brand icons on the [links page](@/links.md) are from [Simple Icons](https://simpleicons.org/), under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). The brands and their logos belong to their owners, as the [Simple Icons disclaimer](https://github.com/simple-icons/simple-icons/blob/develop/DISCLAIMER.md) explains. The site uses them only to show where a link goes.
- The video player is [lite-youtube-embed](https://github.com/paulirish/lite-youtube-embed), copyright 2019 Paul Irish, under the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0).
- The sortable tables use `sortable-table.js`, copyright World Wide Web Consortium, under the [W3C Software and Document License](https://www.w3.org/copyright/software-license-2015/). It comes from the [sortable table example](https://www.w3.org/WAI/ARIA/apg/patterns/table/examples/sortable-table/) of the WAI-ARIA Authoring Practices.
- The repository contains the files of lite-youtube-embed and `sortable-table.js` unchanged. The published site combines them with the scripts and stylesheet of this site into one minified script and one minified stylesheet.

### W3C Software and Document Short Notice

> This site includes `sortable-table.js`, from the [WAI-ARIA Authoring Practices Guide](https://www.w3.org/WAI/ARIA/apg/). Copyright © World Wide Web Consortium. All Rights Reserved. This work is distributed under the [W3C® Software and Document License](https://www.w3.org/copyright/software-license-2015/) in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.

## Tools

These tools build the site. They are not part of the published site.

- [Zola](https://www.getzola.org/) builds the pages.
- [Deno](https://deno.com/) runs the scripts that download and generate the data.
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) downloads the data from YouTube.
- [sharp](https://sharp.pixelplumbing.com/) makes the WebP images, and [ThumbHash](https://evanw.github.io/thumbhash/) makes the blurred placeholders.
- [esbuild](https://esbuild.github.io/) combines and minifies the scripts and stylesheets.
