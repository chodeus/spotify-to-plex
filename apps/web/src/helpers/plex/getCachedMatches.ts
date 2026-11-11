import { getCachedTrackLinks } from '@spotify-to-plex/shared-utils/cache/getCachedTrackLink';
import { getById } from '@spotify-to-plex/plex-music-search/functions/getById';
import { PlexMusicSearchConfig } from '@spotify-to-plex/plex-music-search/types/PlexMusicSearchConfig';
import { PlexMusicSearchTrack } from '@spotify-to-plex/plex-music-search/types/PlexMusicSearchTrack';
import { PlexTrack } from '@spotify-to-plex/plex-music-search/types/PlexTrack';
import { SearchResponse } from '@spotify-to-plex/plex-music-search/types/SearchResponse';

async function getPlexTracks(plexIds: string[], plexConfig: PlexMusicSearchConfig) {
    const foundTracks: PlexTrack[] = []

    for (const plexId of plexIds.filter(Boolean)) {
        try {
            const metaData = await getById(plexConfig, plexId)
            if (metaData)
                foundTracks.push(metaData)
        } catch (_e) {
        }
    }

    return foundTracks
}

/** Each track's cached Plex match that Plex still has, as a search result; manualOnly keeps hand picks only. */
export async function getCachedMatches(searchItems: PlexMusicSearchTrack[], plexConfig: PlexMusicSearchConfig, manualOnly = false) {
    const { found: cachedTrackLinks } = getCachedTrackLinks(searchItems, 'plex')
    const result: SearchResponse[] = []

    for (const searchItem of searchItems) {
        const trackLink = cachedTrackLinks.find(item => item.spotify_id === searchItem.id)
        if (!trackLink?.plex_id || trackLink.plex_id.length === 0 || (manualOnly && !trackLink.manual))
            continue;

        // Searched again when Plex no longer has any of them
        const foundTracks = await getPlexTracks(trackLink.plex_id, plexConfig)
        if (foundTracks.length === 0)
            continue;

        result.push({
            id: searchItem.id,
            title: searchItem.title,
            artist: searchItem.artists?.[0] || '',
            album: searchItem.album || "",
            result: foundTracks
        })
    }

    return result
}
