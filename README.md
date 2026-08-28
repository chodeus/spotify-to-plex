<p align="center"><img src="docs/assets/images/logo.png" width="90"></p>
<h1 align="center">Spotify to Plex</h1>

<p align="center">
  <a href="https://hub.docker.com/r/jjdenhertog/spotify-to-plex"><img src="https://img.shields.io/docker/pulls/jjdenhertog/spotify-to-plex?style=flat-square&logo=docker" alt="Docker Pulls"></a>
  <a href="https://github.com/jjdenhertog/spotify-to-plex/stargazers"><img src="https://img.shields.io/github/stars/jjdenhertog/spotify-to-plex?style=flat-square&logo=github" alt="GitHub Stars"></a>
  <a href="https://github.com/jjdenhertog/spotify-to-plex/blob/main/LICENSE"><img src="https://img.shields.io/github/license/jjdenhertog/spotify-to-plex?style=flat-square" alt="License"></a>
  <a href="https://github.com/jjdenhertog/spotify-to-plex/issues"><img src="https://img.shields.io/github/issues/jjdenhertog/spotify-to-plex?style=flat-square" alt="Issues"></a>
</p>

<p align="center">
  A web application to sync your Spotify playlists with <a href="https://plex.tv/">Plex</a>. Automatically match songs, download missing tracks, and keep your music library in perfect sync.
</p>

<p align="center">
  <img src="docs/assets/images/app_overview.jpg" alt="Spotify to Plex Overview">
</p>

---

## Features

- Sync any Spotify playlist with Plex (including Spotify-owned playlists)
- Advanced track matching with multiple search strategies
- Download missing tracks via Lidarr, SLSKD, or Tidal
- Multiple Spotify user support
- Scheduled automatic synchronization
- Smart caching for faster syncs
---

> [!IMPORTANT]
> The Spotify account you create your Spotify app with needs an active **Premium** subscription. This is a [limitation Spotify added in 2026](https://developer.spotify.com/blog/2026-02-06-update-on-developer-access-and-platform-security), together with a limit of one app per account and a maximum of 5 connected users. See the [Spotify setup](https://jjdenhertog.github.io/spotify-to-plex/spotify/app-setup) docs.

---

## Quick Start

```sh
docker run -d \
    -e SPOTIFY_API_CLIENT_ID=YOUR_CLIENT_ID \
    -e SPOTIFY_API_CLIENT_SECRET=YOUR_CLIENT_SECRET \
    -e SPOTIFY_API_REDIRECT_URI=https://jjdenhertog.github.io/spotify-to-plex/callback.html \
    -e ENCRYPTION_KEY=YOUR_ENCRYPTION_KEY \
    -e PLEX_APP_ID=eXf+f9ktw3CZ8i45OY468WxriOCtoFxuNPzVeDcAwfw= \
    -v /your/config/path:/app/config:rw \
    --network=host \
    jjdenhertog/spotify-to-plex
```

Access the web interface at `http://[your-ip]:9030`

---

## About this fork

This is a fork of [jjdenhertog/spotify-to-plex](https://github.com/jjdenhertog/spotify-to-plex) carrying matching fixes that are open as pull requests upstream. **If they land there, use upstream instead** — this exists so the changes are usable in the meantime.

What it adds:

| | |
|---|---|
| [#128](https://github.com/jjdenhertog/spotify-to-plex/pull/128) | `duration` as a match filter field, so an 8:42 album cut can't be accepted for a 3:03 single |
| [#135](https://github.com/jjdenhertog/spotify-to-plex/pull/135) | `version` as a match filter field — duration can't separate two remixes of equal length |
| [#129](https://github.com/jjdenhertog/spotify-to-plex/pull/129) | expands album search hits into their tracks; Plex's track index can miss tracks whose album it has indexed |
| [#130](https://github.com/jjdenhertog/spotify-to-plex/pull/130) | re-checks cached links and drops ones the duration contradicts, so a wrong match stops being permanent |
| [#131](https://github.com/jjdenhertog/spotify-to-plex/pull/131) | falls back to single-track lookups when Spotify's batch endpoint returns 403 for development-mode apps |
| [#132](https://github.com/jjdenhertog/spotify-to-plex/pull/132) | raises the API body limit so multi-thousand-track playlists stop returning HTTP 413 |
| [#133](https://github.com/jjdenhertog/spotify-to-plex/pull/133) | matches cache writes by Spotify id instead of title/artist equality |
| [#134](https://github.com/jjdenhertog/spotify-to-plex/pull/134) | manual match, building on [@bfayers](https://github.com/bfayers)' [#113](https://github.com/jjdenhertog/spotify-to-plex/pull/113) |
| [#136](https://github.com/jjdenhertog/spotify-to-plex/pull/136) | search a playlist, and review tracks that matched more than one candidate |

### Running it

```sh
docker run -d \
    -e SPOTIFY_API_CLIENT_ID=YOUR_CLIENT_ID \
    -e SPOTIFY_API_CLIENT_SECRET=YOUR_CLIENT_SECRET \
    -e SPOTIFY_API_REDIRECT_URI=https://jjdenhertog.github.io/spotify-to-plex/callback.html \
    -e ENCRYPTION_KEY=YOUR_ENCRYPTION_KEY \
    -v /your/config/path:/app/config:rw \
    --network=host \
    ghcr.io/chodeus/spotify-to-plex:latest
```

Everything else — setup, Spotify app creation, Lidarr and slskd integration — follows the [upstream documentation](https://jjdenhertog.github.io/spotify-to-plex/) unchanged.

### Matching configuration

> [!WARNING]
> The filters below use the `duration` and `version` fields, which **only exist in this fork**. On the upstream image an unknown field makes the whole rule fail to parse and match nothing — so if you apply these and then switch back to `jjdenhertog/spotify-to-plex`, every row silently stops matching and your playlists come out empty. Switch the filters back first.

Settings → Music Search → Match Filters. This is the set running on my own library (~1,000 tracks across 9 playlists):

```json
[
  "artist:match AND title:match AND duration:similarity>=0.65 AND version:match",
  "artist:contains AND title:match AND duration:similarity>=0.65 AND version:match",
  "artist:similarity>=0.85 AND title:similarity>=0.85 AND duration:similarity>=0.65 AND version:match",
  "artist:match AND title:similarity>=0.8 AND duration:similarity>=0.65 AND version:match",
  "artist:match AND title:contains AND duration:similarity>=0.65 AND version:match",
  "artistWithTitle:similarity>=0.9 AND duration:similarity>=0.65 AND version:match",
  "artist:contains AND title:contains AND album:contains AND duration:similarity>=0.65 AND version:match",
  "artist:similarity>=0.7 AND album:match AND title:similarity>=0.85 AND duration:similarity>=0.65 AND version:match"
]
```

Three things are going on:

**`duration:similarity>=0.65` on every row.** An exact copy scores 0.99+, radio-vs-album variance lands around 0.8–0.9, and radio-vs-extended or an outright wrong recording falls below 0.65. It catches gross mismatches, not subtle ones.

**`version:match` on every row.** Duration cannot tell two remixes apart when they are the same length. This compares what the titles claim, ignoring featured-artist credits, years and the words in your Text Processing noise list — so `(Original Mix)` and `(feat. X)` are not treated as differences, but `(Jauz remix)` and `- UK Edit` are.

**Row order matters.** Filters are evaluated top-down and the first row returning anything wins, so the order decides which *imperfect* match is preferred. `artist:match AND title:contains` is demoted below the exact-title rows here, because otherwise a search for "Perfect (Exceeder)" happily settles for a track called "Exceeder".

The trade is deliberate: a wrong match is silent and permanent, a missing track flows to Lidarr or slskd and fixes itself once the file arrives. This configuration prefers the miss. Expect playlists to be a little smaller and to fill back in as downloads land.

Text Processing and Search Approaches are left at their defaults.

---

## Documentation

For detailed setup instructions, configuration options, and integration guides:

**[Read the full documentation](https://jjdenhertog.github.io/spotify-to-plex/)**

---

## Support This Open-Source Project

If you appreciate my work, consider starring this repository or making a donation to support ongoing development. Your support means the world to me—thank you!

[![Buy Me a Coffee](https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png)](https://www.buymeacoffee.com/jjdenhertog)

Are you a developer with some free time on your hands? It would be great if you can help me maintain and improve this project.

---

## License

This project is open source and available under the [MIT License](LICENSE).
