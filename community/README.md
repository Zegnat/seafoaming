# Community data

This folder holds information that the community adds to the wiki. The generator reads it and never changes it.

## Information about a video

To add information about a video, make a file `videos/<id>.md`, where `<id>` is the YouTube ID of the video. The "Add community information" link at the end of each video page opens GitHub with this file name and a template.

```markdown
+++
spotify = "https://open.spotify.com/album/..."
spotify_podcast = "https://open.spotify.com/episode/..."
apple_music = ["https://music.apple.com/...", "https://music.apple.com/..."]
+++

Notes about the video, in Markdown.

## Transcript

A transcript that the community wrote.
```

All parts are optional. A file can even be empty apart from the front matter: the wiki then still fetches the video, which is how to add an unlisted video that no list on the channel shows. `collab = true` lists a video of another channel with the collabs, and `hidden = true` keeps a page that no list shows.

- `spotify` and `apple_music` link to the same recording on those platforms. `spotify_podcast` links to the episode of the podcast of the channel. Apple Music has some recordings twice, so `apple_music` can be one link or a list of links. The video page shows them in the infobox.
- The text below the front matter appears on the video page as notes, after the description.
- A section that starts with `## Transcript` replaces the captions from YouTube on the video page.
- A transcript with timings goes next to the file, as `videos/<id>.vtt` in WebVTT format. It also replaces the captions from YouTube, and its lines link to their time in the video. `transcript` in the front matter says where it comes from: `"whisper"` for speech recognition by `deno task whisper`, `"community"` for a transcript that people wrote or corrected, for example in Aegisub. Change it to `"community"` after you correct a transcript from Whisper.

The content of this folder is available under CC BY 4.0, like the other original content of the wiki. The transcripts in `.vtt` files are different: they write down the words of the videos, which belong to Seafoam Kitten ASMR or, for collabs, to the creators of those videos.
