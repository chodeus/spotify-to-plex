import { removeFeaturing } from "@spotify-to-plex/music-search/utils/removeFeaturing";
import { getMetadata } from "../actions/getMetadata";
import { PlexMusicSearchConfig } from "../types/PlexMusicSearchConfig";
import { PlexItemMissingError } from "../utils/PlexItemMissingError";

export async function getById(config: PlexMusicSearchConfig, key: string) {
    let metaData: Awaited<ReturnType<typeof getMetadata>>;
    try {
        metaData = await getMetadata(config.uri, config.token, key);
    } catch (error) {
        const status = (error as { response?: { status?: number } } | undefined)?.response?.status;
        if (status === 404)
            throw new PlexItemMissingError(key);

        throw error;
    }

    const [item] = metaData;
    if (!item)
        throw new PlexItemMissingError(key);

    let src = '';
    try {
        src = item.Media?.[0]?.Part?.[0]?.file || '';
    } catch (_e) {
        // Ignore error
    }

    return {
        id: item.key || '',
        guid: item.guid || '',
        image: item.thumb || '',
        title: item.title || '',
        duration_ms: item.duration,
        src,
        album: {
            guid: item.parentGuid || '',
            id: item.parentKey || '',
            title: item.parentTitle || '',
            image: item.parentThumb || '',
        },
        artist: {
            guid: item.grandparentGuid || '',
            id: item.grandparentKey || '',
            title: removeFeaturing(item.originalTitle || item.grandparentTitle || ''),
            image: item.grandparentThumb || '',
        }
    };
}