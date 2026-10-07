import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { filterUnique } from "../array/filterUnique"
import { getStorageDir } from "../utils/getStorageDir"
import { writeJsonFileAtomic } from "../utils/writeJsonFileAtomic"

import type { TrackLink } from "@spotify-to-plex/shared-types/common/track";

type PlexMusicSearchTrack = {
    id: string;
    title: string;
    artists: string[];
}

type TidalMusicSearchTrack = {
    id: string;
    title: string;
    artists: string[];
}

export function getCachedTrackLinks(
    searchItems: (PlexMusicSearchTrack | TidalMusicSearchTrack)[],
    type: 'plex' | 'tidal' | 'slskd'
) {
    //////////////////////////////////////
    // Handeling cached links
    //////////////////////////////////////
    const path = join(getStorageDir(), 'track_links.json')
    const readLinks = (): TrackLink[] => existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : []
    const all = readLinks()

    // Each entry as last read or saved, to tell which ones this run changed
    const saved = new Map(all.map(link => [link.spotify_id, JSON.stringify(link)]))

    const found: TrackLink[] = [];

    for (let i = 0; i < searchItems.length; i++) {
        const searchItem = searchItems[i];

        const trackLink = all.find(item => item.spotify_id == searchItem?.id)
        if (!trackLink)
            continue;

        switch (type) {
            case "plex":
                if (trackLink.plex_id && trackLink.plex_id.length > 0)
                    found.push(trackLink)

                break;

            case "tidal":
                if (trackLink.tidal_id && trackLink.tidal_id.length > 0)
                    found.push(trackLink)

                break;

            case "slskd":
                if (trackLink.slskd_files && trackLink.slskd_files.length > 0)
                    found.push(trackLink)

                break;
        }
    }

    // The web app or an overlapping sync may have written since the read, so only
    // this run's changes go into the file as it is now
    const save = () => {
        const changed = all.filter(link => saved.get(link.spotify_id) !== JSON.stringify(link))
        if (changed.length == 0)
            return;

        const current = readLinks()
        const index = new Map(current.map((link, position) => [link.spotify_id, position]))

        for (const link of changed) {
            const position = index.get(link.spotify_id)
            const stored = position === undefined ? undefined : current[position]
            // A manual pick made since this run's read stands; one this run read and changed itself does not
            const pickedSince = stored?.manual && !link.manual && JSON.stringify(stored) !== saved.get(link.spotify_id)

            if (position === undefined)
                current.push(link)
            else if (!pickedSince)
                current[position] = link

            saved.set(link.spotify_id, JSON.stringify(link))
        }

        writeJsonFileAtomic(path, current)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const add = (searchResult: { id?: string, title: string, artist: string, result: any[], matched_by?: 'isrc' }[], type: "tidal" | "plex" | "slskd", album?: { id: string }) => {

        ////////////////////////////////
        // Cache tracks
        ////////////////////////////////
        searchResult.forEach(item => {
            if (item.result && item.result.length > 0) {
                // Prefer the spotify id - title/artist equality misses multi-artist
                // variants, leaving stale links that get re-searched every sync
                const searchItem = searchItems.find(toSearchItem => item.id
                    ? toSearchItem.id == item.id
                    : (toSearchItem.title == item.title && toSearchItem.artists.indexOf(item.artist) > -1))
                if (!searchItem)
                    return;

                // Create new track links if nont existant
                let trackLink = all.find(item => item.spotify_id == searchItem.id)
                if (!trackLink) {
                    trackLink = { spotify_id: searchItem.id }
                    all.push(trackLink)
                }

                switch (type) {
                    case "plex":
                        // A person's pick stands until they pick again
                        if (trackLink.manual)
                            break;

                        trackLink.plex_id = item.result
                            .map(item => item.id)
                        trackLink.plex_checked_at = Date.now()

                        // A later title match must not inherit an earlier ISRC match's exemption
                        if (item.matched_by)
                            trackLink.plex_matched_by = item.matched_by
                        else
                            delete trackLink.plex_matched_by

                        break;

                    case "tidal":
                        trackLink.tidal_id = item.result
                            .map(item => item.id)
                        break;

                    case "slskd":
                        trackLink.slskd_files = item.result
                            .filter(file => file.username && file.filename && file.size)
                            .map(file => ({
                                username: file.username!,
                                filename: file.filename!,
                                size: file.size!
                            }))
                        break;
                }
            }
        })

        ////////////////////////////////
        // Cache albums
        ////////////////////////////////
        if (album) {
            let albumIds: string[] = []
            searchResult.forEach(item => {
                albumIds = albumIds.concat(item.result.filter(item => !!item.album).map(item => item.album?.id || ""))
            })
            albumIds = albumIds.filter(filterUnique)

            let albumLink = all.find(item => item.spotify_id == album.id)
            if (!albumLink) {
                albumLink = { spotify_id: album.id }
                all.push(albumLink)
            }

            switch (type) {
                case "plex":
                    albumLink.plex_id = albumIds
                    break;

                case "tidal":
                    albumLink.tidal_id = albumIds
                    break;
            }
        }


        save()
    }

    // A re-check that found nothing still confirms the cached link for another week
    const markChecked = (spotifyIds: string[]) => {
        const now = Date.now()

        for (const link of all)
            if (spotifyIds.includes(link.spotify_id))
                link.plex_checked_at = now

        save()
    }

    return { path, all, found, add, save, markChecked }

}