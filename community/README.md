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

All parts are optional. A file can even be empty apart from the front matter: the wiki then still fetches the video, which is how to add an unlisted video that no list on the channel shows.

- `spotify` and `apple_music` link to the same recording on those platforms. `spotify_podcast` links to the episode of the podcast of the channel. Apple Music has some recordings twice, so `apple_music` can be one link or a list of links. The video page shows them in the infobox.
- The text below the front matter appears on the video page as notes, after the description.
- A section that starts with `## Transcript` replaces the captions from YouTube on the video page.

The content of this folder is available under CC BY 4.0, like the other original content of the wiki.
