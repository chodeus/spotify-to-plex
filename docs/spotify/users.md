---
title: User Integration
parent: Spotify Setup
nav_order: 3
---

# Spotify User Integration

In the Users section you have the option to add Spotify users. You do not need this for any manual imports, you only need it when you want to do a bit more with Spotify accounts.

---

## Features

When you have a connected user you can:

- Easily add albums or playlists saved by that user
- Import user-specific or private playlists
- Automatically sync most recently listened songs
- Sync liked songs automatically

![Spotify Users](../assets/images/spotify_users.jpg)

---

## Adding Users

1. Navigate to the Users section in the app
2. Click "Connect Spotify Account"
3. Log in to your Spotify account when prompted
4. Authorize the app to access your data

---

## Multiple Users

You can add multiple Spotify users to sync playlists from different accounts.

{: .important }
Since 2026 Spotify limits you to 5 connected users per app. See [App Configuration](app-setup#spotify-requirements).

{: .important }
To add multiple users, you need to sign out of Spotify before attempting to add the extra user. Alternatively, perform this step in an incognito/private browser window.

---

## Plex Home User

Playlists are made in the Plex account you signed in with. To make a user's playlists in a Plex Home user's account instead, so that person sees them as their own (in Plexamp, for example), open the user's sync settings and pick them under **Plex user**.

- It applies to playlists for items added from that user's library or recently played. Items added by link stay in your account.
- It applies to the scheduled sync and to Create and Update on the playlist page.
- After a change, the next sync or Update makes new copies in the new account. The old copies stay where they are; delete them in Plex if you don't want them.
- Home users with a PIN can't be picked.
- These playlists are not published to [Home Assistant over MQTT](../integrations/mqtt), and the playlist page shows no Plex Web link for them. Both work as the Plex owner, who can't see another account's playlists.

---

## Security

When you login to your Spotify account, the tokens are stored in `spotify.json` in your storage folder (`/app/config`).

### Encryption

Sensitive data is encrypted using an encryption key that you provide:

```sh
-e ENCRYPTION_KEY=your_encryption_key_here
```

Generate a secure key using:

```bash
openssl rand -hex 32
```

### Best Practices

- Properly protect the folder that you are mounting to this app
- Use a strong, unique encryption key
- Keep your encryption key secret and backed up
