import { httpStatusOf } from './httpStatusOf';

// A server asking for longer than this is down for the run, not pacing it
const MAX_WAIT_MS = 60_000;

/** The wait a 429 or 5xx asks for in its Retry-After header, in ms; undefined when it names none. */
export function retryAfterMs(error: unknown) {
    const status = httpStatusOf(error);
    if (status !== 429 && !(status && status >= 500))
        return;

    const header = (error as { response?: { headers?: Record<string, unknown> } }).response?.headers?.['retry-after'];
    if ((typeof header !== 'string' || !header.trim()) && typeof header !== 'number')
        return;

    // Either delay-seconds or an HTTP date
    const seconds = Number(header);
    const wait = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(String(header)) - Date.now();
    if (!Number.isFinite(wait))
        return;

    return Math.min(Math.max(wait, 0), MAX_WAIT_MS);
}
