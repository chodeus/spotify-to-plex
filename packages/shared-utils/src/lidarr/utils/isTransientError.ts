import axios from 'axios';
import { isRetryable } from '@spotify-to-plex/http-client/isRetryable';

/**
 * Whether a request failed for a reason that says nothing about the answer - no
 * answer at all, a rate limit, or a server error. Worth retrying, and never
 * worth remembering as "there is no such release".
 */
export function isTransientError(error: unknown) {
    // A body cut off after the headers keeps the 200 it was answering with, and isRetryable passes that too
    return axios.isAxiosError(error) && isRetryable(error);
}
