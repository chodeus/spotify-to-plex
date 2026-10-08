import axios from 'axios';
import { isRetryable } from '@spotify-to-plex/http-client/isRetryable';

/** A failure that says nothing about the answer (no answer, 408, 429, 5xx): retry it, and never cache it as a miss. */
export function isTransientError(error: unknown) {
    // A body cut off after the headers keeps the 200 it was answering with, and isRetryable passes that too
    return axios.isAxiosError(error) && isRetryable(error);
}
