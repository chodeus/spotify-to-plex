/* eslint-disable unicorn/prefer-code-point */
/* eslint-disable prefer-template */

import { removeFeaturing } from "@spotify-to-plex/music-search/utils/removeFeaturing";
import { HubSearchResult } from "../types/actions/HubSearchResult";
import { HubSearchResponse } from "../types/plex/HubSearchResponse";
import { AxiosRequest } from "@spotify-to-plex/http-client/AxiosRequest";
import { httpStatusOf } from "@spotify-to-plex/http-client/httpStatusOf";
import { retryAfterMs } from "@spotify-to-plex/http-client/retryAfterMs";
import { getAPIUrl } from "@spotify-to-plex/shared-utils/utils/getAPIUrl";

export default function hubSearch(uri: string, token: string, query: string, limit: number = 5) {
    return new Promise<HubSearchResult[]>((resolve, reject) => {

        // Fix forbidden characters
        const forbiddenCharacters = ["...", "..", '"']

        for (let i = 0; i < forbiddenCharacters.length; i++) {
            const element = forbiddenCharacters[i];
            if (element)
                query = query.split(element).join('')
        }

        // Nothing left to ask: no match, not a failed request
        if (!query.trim()) {
            resolve([]);

            return;
        }

        const url = getAPIUrl(uri, `/hubs/search?query=${fixedEncodeURIComponent(query.trim())}&limit=${limit}`);
        const get = () => AxiosRequest.get<HubSearchResponse>(url, token);
        // Plex asking for a pause gets it and one more try; any other failure ends this query alone
        get()
            .catch(async (error: unknown) => {
                const wait = retryAfterMs(error);
                if (wait === undefined)
                    throw error;

                await new Promise(resolve => { setTimeout(resolve, wait) });

                return get();
            })
            .then((result) => {
                const response: HubSearchResult[] = [];
                const { Hub } = result.data.MediaContainer;

                if (!Hub || Hub.length === 0) {
                    resolve(response);

                    return;
                }

                for (const hub of Hub) {
                    if (!hub?.Metadata)
                        continue;

                    if (hub.type === "album")
                        processAlbumMetadata(hub.Metadata, response);

                    if (hub.type === "track")
                        processTrackMetadata(hub.Metadata, response);
                }

                resolve(response)
            })
            .catch((error: unknown) => {

                // eslint-disable-next-line no-console
                console.error(`Plex API Request failed:\n${url}`)
                // A status means Plex answered (a bad token answers 401), so it was reachable
                const status = httpStatusOf(error);
                reject(status ? `Plex answered ${status}` : "Could not connect to server");
            })
    })
}

function processAlbumMetadata(metadata: any[], response: HubSearchResult[]) {
    for (const item of metadata) {
        if (!item)
            continue;

        response.push({
            type: "album",
            id: item.key || '',
            ratingKey: item.ratingKey || '',
            guid: item.guid || '',
            score: item.score || 0,
            image: item.thumb || '',
            year: item.year || 0,
            title: item.title || '',
            artist: {
                guid: item.parentGuid || '',
                id: item.parentKey || '',
                title: removeFeaturing(item.parentTitle || ''),
                alternative_title: "",
                image: item.parentThumb || '',
            },
        });
    }
}

function processTrackMetadata(metadata: any[], response: HubSearchResult[]) {
    for (const item of metadata) {
        if (!item)
            continue;

        response.push({
            type: "track",
            id: item.key || '',
            ratingKey: item.ratingKey || '',
            guid: item.guid || '',
            score: item.score || 0,
            image: item.thumb || '',
            title: item.title || '',
            duration_ms: item.duration,
            album: {
                id: item.parentKey || '',
                guid: item.parentGuid || '',
                title: item.parentTitle || '',
                year: item.parentYear || 0,
                image: item.parentThumb || '',
            },
            artist: {
                id: item.grandparentKey || '',
                guid: item.grandparentGuid || '',
                title: removeFeaturing(item.originalTitle || item.grandparentTitle || ''),
                image: item.grandparentThumb || '',
            }
        });
    }
}

function fixedEncodeURIComponent(str: string) {
    return encodeURIComponent(str)
        .replace(/[!'()*]/g, (c) => {
            return '%' + c.charCodeAt(0).toString(16);
        })
        .replace(/\./g, '%2E'); // Also encode dots

}