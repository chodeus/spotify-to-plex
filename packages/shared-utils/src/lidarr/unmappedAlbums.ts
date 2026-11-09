import type { UnmappedAlbum, UnmappedAlbums } from '@spotify-to-plex/shared-types/lidarr/UnmappedAlbum';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isSpotifyId } from '../musicbrainz/importLinks';
import { getStorageDir } from '../utils/getStorageDir';
import { writeJsonFileAtomic } from '../utils/writeJsonFileAtomic';

type AlbumRef = { spotify_album_id?: string; artist_name: string; album_name: string };

export function unmappedAlbumsPath() {
    return join(getStorageDir(), 'lidarr_unmapped_albums.json');
}

/** The stored list; an absent or unreadable file reads as empty, so a bad copy is replaced on the next write. */
export function readUnmappedAlbums(path = unmappedAlbumsPath()): UnmappedAlbums {
    if (!existsSync(path))
        return {};

    try {
        const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
            return {};

        return parsed as UnmappedAlbums;
    } catch (e) {
        console.error('Error reading lidarr_unmapped_albums.json:', e);

        return {};
    }
}

export function writeUnmappedAlbums(list: UnmappedAlbums, path = unmappedAlbumsPath()) {
    writeJsonFileAtomic(path, list, 2);
}

/** Read, change and write back in one step, for callers outside the sync run (the web API). */
export function updateUnmappedAlbums(change: (list: UnmappedAlbums) => UnmappedAlbums, path = unmappedAlbumsPath()) {
    const next = change(readUnmappedAlbums(path));
    writeUnmappedAlbums(next, path);

    return next;
}

/** Adds the album, or counts another failed check on it; keeps first_seen and a dismissal. */
export function recordUnmapped(list: UnmappedAlbums, album: AlbumRef, now = Date.now()): UnmappedAlbums {
    const id = album.spotify_album_id;
    // Without an album id there is no Harmony link to offer and nothing to key on
    if (!isSpotifyId(id))
        return list;

    const existing = list[id];
    const entry: UnmappedAlbum = {
        spotify_album_id: id,
        artist_name: album.artist_name,
        album_name: album.album_name,
        first_seen: existing?.first_seen ?? now,
        last_checked: now,
        attempts: (existing?.attempts ?? 0) + 1,
        ...(existing?.dismissed ? { dismissed: true } : {})
    };

    return { ...list, [id]: entry };
}

/** Counts a failed check only on an album already listed, so a manual retry of anything else adds nothing. */
export function touchUnmapped(list: UnmappedAlbums, spotifyAlbumId: string | undefined, now = Date.now()): UnmappedAlbums {
    if (!spotifyAlbumId || !list[spotifyAlbumId])
        return list;

    return recordUnmapped(list, list[spotifyAlbumId], now);
}

/** Drops the album: MusicBrainz knows it now. */
export function clearUnmapped(list: UnmappedAlbums, spotifyAlbumId: string | undefined): UnmappedAlbums {
    if (!spotifyAlbumId || !list[spotifyAlbumId])
        return list;

    const { [spotifyAlbumId]: _removed, ...rest } = list;

    return rest;
}

export function setUnmappedDismissed(list: UnmappedAlbums, spotifyAlbumId: string, dismissed: boolean): UnmappedAlbums {
    const existing = list[spotifyAlbumId];
    if (!existing)
        return list;

    const { dismissed: _old, ...entry } = existing;

    return { ...list, [spotifyAlbumId]: dismissed ? { ...entry, dismissed: true } : entry };
}

/** Keeps only albums still on the missing lists: one now in Plex, or whose playlist went, is no longer wanted. */
export function pruneUnmapped(list: UnmappedAlbums, stillMissingIds: Iterable<string | undefined>): UnmappedAlbums {
    const keep = new Set(stillMissingIds);

    return Object.fromEntries(Object.entries(list).filter(([id]) => keep.has(id)));
}
