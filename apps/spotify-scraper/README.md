# Spotify Scraper Service

A small Flask API that reads public Spotify playlists the Web API will not serve to the connected account (editorial and personalised mixes). It runs inside the main image under supervisord on port 3020, and the sync reaches it through `SPOTIFY_SCRAPER_URL`.

## POST /playlist

```json
{ "url": "https://open.spotify.com/playlist/<id>", "include_album_data": true, "max_tracks": null }
```

Returns the playlist from [SpotifyScraper](https://pypi.org/project/spotifyscraper/), normalised for the sync: every track flattened into `tracks`, plus `track_count` and `truncated`. `truncated` is true when the library fell back to a degraded read that may hold fewer tracks than the playlist; the sync refuses such a read rather than shrink the Plex playlist. A request that is missing or malformed answers 400; a failed scrape answers 500 with a fixed message.

## GET /health

`{ "status": "healthy", "service": "spotify-scraper" }`

## Running it on its own

```bash
pip install -r requirements.txt
python app.py   # PORT defaults to 3020
```
