import { AxiosResponse } from "axios";
import { Metadata } from "../types/plex/Metadata";
import { AxiosRequest } from "@spotify-to-plex/http-client/AxiosRequest";
import { httpStatusOf } from "@spotify-to-plex/http-client/httpStatusOf";
import { getAPIUrl } from "@spotify-to-plex/shared-utils/utils/getAPIUrl";

type GetMetaDataResponse = {
    MediaContainer: {
        size: number,
        Metadata: Metadata[]
    }
};

export async function getMetadata(uri: string, token: string, key: string) {
    const url = getAPIUrl(uri, key);
    let result: AxiosResponse<GetMetaDataResponse>;

    try {
        result = await AxiosRequest.get<GetMetaDataResponse>(url, token)
    } catch (error) {
        // A 4xx (a deleted item, a bad token) answers the same on a retry; 408 and 429 are worth one
        const status = httpStatusOf(error);
        if (status && status >= 400 && status < 500 && status != 408 && status != 429)
            throw error;

        await (new Promise(resolve => { setTimeout(resolve, 1000) }))
        result = await AxiosRequest.get<GetMetaDataResponse>(url, token)
    }

    if (result?.data) {
        const { MediaContainer } = result.data;
        if (MediaContainer && MediaContainer.size > 0)
            return MediaContainer.Metadata;
    }

    return []
}
