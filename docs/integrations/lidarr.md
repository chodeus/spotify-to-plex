---
title: Lidarr
parent: Integrations
nav_order: 1
---

# Lidarr Integration

When you have configured the Lidarr integration, you can automatically send missing albums to Lidarr for download.

{: .warning }
Lidarr synchronizes albums, not songs. A playlist can easily contain songs from 50+ albums. This feature will cause many albums to be downloaded by Lidarr.

---

## Prerequisites

1. A running [Lidarr](https://github.com/Lidarr/Lidarr) instance
2. Lidarr API Key (Settings → General → Security → API Key)

---

## Configuration

### Step 1: Add Environment Variable

```sh
-e LIDARR_API_KEY=YOUR_LIDARR_API_KEY
```

### Step 2: Configure in App

Navigate to **Advanced → Lidarr Integration** and configure:

| Setting | Description |
|---------|-------------|
| Lidarr URL | Base URL of your Lidarr instance (e.g., `http://192.168.1.100:8686`) |
| Root Folder Path | Where Lidarr should download music (must match a root folder in Lidarr) |
| Quality Profile ID | Usually `1` for the default quality profile |
| Metadata Profile ID | Usually `1` for the default metadata profile |
| Automatic sync | Enable automatic synchronization with Lidarr |

![Lidarr Settings](../assets/images/lidarr_settings.jpg)

---

## Usage

### Sending Albums Manually

When viewing missing tracks for a playlist, you'll see a "Send to Lidarr" button that shows how many unique albums are missing.

![Lidarr Dialog](../assets/images/lidarr_dialog.jpg)

### Albums not in MusicBrainz

Lidarr can only add an album MusicBrainz has an entry for. **Advanced → Not in MusicBrainz** lists the missing albums it could not add, each with a link to import it into MusicBrainz with Harmony. After an import, allow 2-3 hours for Lidarr's metadata server to pick it up; the next sync, or a retry on that page, sends it.

### Automatic Sync

When automatic sync is enabled, missing albums are sent to Lidarr during the daily synchronization process.

Trigger manually via:
```
http://[IP-ADDRESS]:9030/api/sync/lidarr
```

---

## Downloading from Soulseek with Tubifarry

If Lidarr has the [Tubifarry](https://github.com/TypNull/Tubifarry) plugin with its Slskd indexer and download client, Lidarr can fetch the albums this integration sends from Soulseek. Lidarr downloads whole albums and imports them against MusicBrainz, so use this setup instead of the [SLSKD integration](slskd) in Spotify to Plex.

1. In Spotify to Plex, enable the Lidarr integration and **Automatic sync**.
2. In Spotify to Plex, turn off **Enable Automatic Sync** in **Advanced → SLSKD Integration**. Turn off the whole integration unless you use its manual search.
3. In Lidarr, go to **Settings → Indexers**, edit the **Slskd** indexer, and turn on **Enable Automatic Search**. When Spotify to Plex sends an album, it asks Lidarr to search for it, and Lidarr only runs that search on indexers with automatic search on.

{: .warning }
The Tubifarry Slskd download client has an advanced **Inclusive** setting. When it's on, Lidarr picks up every download in slskd, including the single songs the Spotify to Plex SLSKD sync downloads. Lidarr then tries to import each song as an album of its own, and most of those imports fail to match. Keep the Spotify to Plex SLSKD sync off while **Inclusive** is on, or turn **Inclusive** off so Lidarr only tracks the downloads it starts.

---

## Finding Profile IDs

To find your Quality and Metadata Profile IDs:

1. Open Lidarr
2. Go to Settings → Profiles
3. The ID is visible in the URL when editing a profile, or use the Lidarr API
