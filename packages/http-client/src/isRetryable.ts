import { httpStatusOf } from './httpStatusOf';

/** False for a 4xx (a deleted item, a bad token), which answers the same on a retry; 408 and 429 are worth one. */
export function isRetryable(error: unknown) {
    const status = httpStatusOf(error);

    return !(status && status >= 400 && status < 500 && status !== 408 && status !== 429);
}
