import { AxiosResponse } from "axios";
import { Metadata } from "../types/plex/Metadata";
import { AxiosRequest } from "@spotify-to-plex/http-client/AxiosRequest";
import { isRetryable } from "@spotify-to-plex/http-client/isRetryable";
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
        if (!isRetryable(error))
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
