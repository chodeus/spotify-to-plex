import { getCachedTrackLinks } from '@spotify-to-plex/shared-utils/cache/getCachedTrackLink';
import { getById } from '@spotify-to-plex/plex-music-search/functions/getById';
import { PlexMusicSearchConfig } from '@spotify-to-plex/plex-music-search/types/PlexMusicSearchConfig';
import { PlexMusicSearchTrack } from '@spotify-to-plex/plex-music-search/types/PlexMusicSearchTrack';
import { PlexTrack } from '@spotify-to-plex/plex-music-search/types/PlexTrack';
import { PlexItemMissingError } from '@spotify-to-plex/plex-music-search/utils/PlexItemMissingError';
import { SearchResponse } from '@spotify-to-plex/plex-music-search/types/SearchResponse';

async function getPlexTracks(plexIds: string[], plexConfig: PlexMusicSearchConfig) {
    const foundTracks: PlexTrack[] = []
    const deletedIds: string[] = []
    let unanswered = false

    for (const plexId of plexIds.filter(Boolean)) {
        try {
            const metaData = await getById(plexConfig, plexId)
            if (metaData)
                foundTracks.push(metaData)
        } catch (error) {
            if (error instanceof PlexItemMissingError)
                deletedIds.push(plexId)
            else
                unanswered = true
        }
    }

    return { foundTracks, unanswered, deletedIds }
}

/** Each track's cached Plex match that Plex still has, as a search result; manualOnly keeps hand picks only. */
export async function getCachedMatches(searchItems: PlexMusicSearchTrack[], plexConfig: PlexMusicSearchConfig, manualOnly = false) {
    const { found: cachedTrackLinks, save } = getCachedTrackLinks(searchItems, 'plex')
    let changed = false
    const result: SearchResponse[] = []

    for (const searchItem of searchItems) {
        const trackLink = cachedTrackLinks.find(item => item.spotify_id === searchItem.id)
        if (!trackLink?.plex_id || trackLink.plex_id.length === 0 || (manualOnly && !trackLink.manual))
            continue;

        // Searched again when Plex no longer has any of them
        const { foundTracks, unanswered, deletedIds } = await getPlexTracks(trackLink.plex_id, plexConfig)

        // As the sync does: an id Plex no longer has goes, and a hand pick with none left is no pick, so the search's match can be saved
        if (deletedIds.length > 0) {
            trackLink.plex_id = trackLink.plex_id.filter(id => !deletedIds.includes(id))
            if (trackLink.plex_id.length === 0)
                delete trackLink.manual

            changed = true
        }

        // An automatic match would quietly take a hand pick's place for a request Plex did not answer
        if (manualOnly && foundTracks.length === 0 && unanswered)
            throw new Error(`Plex did not answer for the hand match of ${searchItem.title}`)

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

    if (changed)
        save()

    return result
}
