/* eslint-disable max-depth */
import { search as musicSearch } from "@spotify-to-plex/music-search/functions/search";
import { filterOutWords } from "@spotify-to-plex/music-search/utils/filterOutWords";
import { Track } from "@spotify-to-plex/music-search/types/Track";
import { PlexMusicSearchApproach } from "../types/PlexMusicSearchApproach";
import { PlexMusicSearchTrack } from "../types/PlexMusicSearchTrack";
import { SearchQuery } from "../types/SearchResponse";
import { PlexTrack } from "../types/PlexTrack";
import hubSearchToPlexTrack from "../utils/searching/hubSearchToPlexTrack";
import { searchForTrack } from "../utils/searching/searchForTrack";
import searchResultToTracks from "../utils/searching/searchResultToTracks";
import { getConfig, addToCache, getFromCache } from "../session/state";

export async function newTrackSearch(approaches: PlexMusicSearchApproach[], searchTrack: PlexMusicSearchTrack, analyze: boolean = false) {
    const { id, artists, title, album = '', duration_ms } = searchTrack;

    // Build artist variations (including combined artists)
    const artistVariations = [...artists];
    if (artists.length > 1) {
        artistVariations.push(artists.join(", "));
    }

    const allQueries: SearchQuery[] = [];
    let finalResult: PlexTrack[] = [];
    // A query Plex did not answer might have found the track, so an empty result then says nothing
    let errored = false;

    try {
        // NEW: Loop through approaches first, then artists
        for (const approach of approaches) {
            if (finalResult.length > 0 && !analyze)
                break; // Early exit if we found results and not analyzing

            // For each approach, try all artist variations
            for (const artist of artistVariations) {

                if (!artist)
                    continue;

                const searchResult = await tryApproachWithArtist(approach, { id, artist, title, album, duration_ms, artists, originalTitle: title }, analyze);
                if (!searchResult) {
                    errored = true;
                    continue;
                }

                allQueries.push(...searchResult.queries);

                if (searchResult.result.length == 0)
                    continue;

                finalResult = searchResult.result;

                if (!analyze) {
                    return {
                        id,
                        artist: artists[0] || '',
                        title,
                        album: album || "",
                        duration_ms,
                        queries: allQueries,
                        result: finalResult
                    };
                }
            }
        }

        return {
            id,
            artist: artists[0] || '',
            title,
            album: album || "",
            duration_ms,
            queries: allQueries,
            result: finalResult,
            ...(errored && finalResult.length == 0 ? { failed: true } : {})
        };

    } catch (_e) {
        throw new Error("Something went wrong while searching");
    }
}


// Helper function to safely try an approach with an artist
type SearchParams = { id: string; artist: string; title: string; album: string; duration_ms?: number; artists: string[]; originalTitle: string };

async function tryApproachWithArtist(approach: PlexMusicSearchApproach, searchParams: SearchParams, analyze: boolean = false): Promise<{ queries: SearchQuery[]; result: PlexTrack[] } | null> {
    try {
        return await performApproachSearch(approach, searchParams, analyze);
    } catch (_e) {
        return null;
    }
}

async function performApproachSearch(approach: PlexMusicSearchApproach, searchParams: SearchParams, analyze: boolean = false): Promise<{ queries: SearchQuery[]; result: PlexTrack[] }> {
    const { id, artist, title, album, duration_ms, artists, originalTitle } = searchParams;
    const config = getConfig();

    if (!config)
        throw new Error("Configuration not set. Call setConfig first.");

    const queries: SearchQuery[] = [];
    let searchResult: PlexTrack[] = [];

    const { id: approachId, trim, filtered, removeQuotes: removeQuotesSetting, ignoreQuotes } = approach;
    // The settings UI and the default config write removeQuotes; ignoreQuotes is the older name
    const removeQuotes = removeQuotesSetting ?? ignoreQuotes;

    // Apply text processing
    const searchArtist = filterOutWords(artist.toLowerCase(), config.musicSearchConfig!.textProcessing, filtered, trim, removeQuotes);
    const searchAlbum = filterOutWords(album.toLowerCase(), config.musicSearchConfig!.textProcessing, filtered, trim, removeQuotes);
    const searchTrack = filterOutWords(title.toLowerCase(), config.musicSearchConfig!.textProcessing, filtered, trim, removeQuotes);

    const searchPlex = async (artist: string, title: string, album: string, cacheId: string) => {
        const searchResults = await searchForTrack(config.uri, config.token, artist, title, album);
        const musicSearchResult = musicSearch({ id, artist, title, album, duration_ms, artists, originalTitle }, searchResultToTracks(searchResults), analyze);

        const plexTracks = musicSearchResult
            .map((item: Track) => {
                const searchResult = searchResults.find(track => track.id == item.id);
                if (!searchResult)
                    return null;

                return {
                    ...searchResult,
                    matching: item.matching
                };
            })
            .filter((item) => !!item)
            .map((item) => ({ ...hubSearchToPlexTrack(item), matching: item.matching }));

        addToCache(cacheId, plexTracks);

        return plexTracks;
    };

    // Perform search function
    const performSearch = async (approach: string, artist: string, title: string, album: string) => {
        const cacheId = `${artist}-${title}-${album}`;
        const plexTracks = getFromCache(cacheId) ?? await searchPlex(artist, title, album, cacheId);

        // Cached or not, the analyze view lists every query an approach made
        const query: SearchQuery = { approach, artist, title, album };
        if (analyze)
            query.result = plexTracks;

        queries.push(query);

        return plexTracks;
    };

    // Find and cache result
    searchResult = await performSearch(approachId, searchArtist, searchTrack, searchAlbum);

    // Rewrite "&" to "and"
    if (searchResult.length == 0 && (searchArtist.indexOf("&") > -1 || searchTrack.indexOf("&") > -1)) {
        const altSearchArtist = searchArtist.split('&').join('and');
        const altSearchTrack = searchTrack.split('&').join('and');
        searchResult = await performSearch(approachId, altSearchArtist, altSearchTrack, searchAlbum);
    }

    // Search for albums
    // Plex has difficulties finding tracks where the album name is the same as the track
    // if (searchResult.length == 0)
    //     searchResult = await performSearch(approachId, searchArtist, searchTrack, searchAlbum, true);

    return { queries, result: searchResult };
}