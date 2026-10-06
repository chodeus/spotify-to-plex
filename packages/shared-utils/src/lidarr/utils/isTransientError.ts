import axios from 'axios';

/**
 * Whether a request failed for a reason that says nothing about the answer -
 * MusicBrainz being busy or the connection dropping. Worth retrying, and never
 * worth remembering as "there is no such release".
 */
export function isTransientError(error: unknown) {
    return axios.isAxiosError(error) &&
        (error.response?.status === 503 ||
            error.response?.status === 429 ||
            error.code === 'ECONNRESET' ||
            error.code === 'ETIMEDOUT');
}
