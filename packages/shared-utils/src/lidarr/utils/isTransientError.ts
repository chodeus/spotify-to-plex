import axios from 'axios';

/**
 * Whether a request failed for a reason that says nothing about the answer - no
 * answer at all, a rate limit, or a server error. Worth retrying, and never
 * worth remembering as "there is no such release".
 */
export function isTransientError(error: unknown) {
    if (!axios.isAxiosError(error))
        return false;

    const status = error.response?.status;

    return status === undefined || status === 429 || status >= 500;
}
