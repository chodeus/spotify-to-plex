import axios from 'axios';
import { retryAfterMs } from '@spotify-to-plex/http-client/retryAfterMs';
import { isTransientError } from './isTransientError';

// MusicBrainz asks anonymous clients to identify themselves, and answers 403 to
// a request with no agent string at all
const USER_AGENT = 'spotify-to-plex/1.0 ( https://github.com/jjdenhertog/spotify-to-plex )';

// MusicBrainz allows roughly one request a second per address and answers 503
// once you outrun it. Pacing lived at some call sites and not others, so an
// album needing a URL lookup and two searches fired three requests in two
// seconds and lost a quarter of a run to "unavailable"
const MIN_INTERVAL_MS = 1100;

// Without one, a MusicBrainz that stops answering holds the whole Lidarr job
const REQUEST_TIMEOUT_MS = 20_000;

// Retries of a busy answer (503 and the like), 2s/4s/8s apart; a busy MusicBrainz answers fast
const BUSY_RETRIES = 3;
// A request that got no answer at all already took up to REQUEST_TIMEOUT_MS: retry it only once,
// so a MusicBrainz that is down costs ~42s per call, not ~94s (a manual send waits on this)
const NO_ANSWER_RETRIES = 1;
const RETRY_DELAY_MS = 2000;
// After a call gives up on a transient failure, later calls fail at once for this long instead of each paying again
const DOWN_FOR_MS = 2 * 60 * 1000;

let nextSlotAt = 0;
let heldUntil = 0;
let downUntil = 0;
let downError: unknown;

/**
 * Wait for this request's turn. The slot is claimed synchronously, before any
 * awaiting, so two callers in flight at once take consecutive slots rather than
 * both reading the same "last request" time and going out together.
 */
async function pace(): Promise<void> {
    const now = Date.now();
    const slot = Math.max(now, nextSlotAt);
    nextSlotAt = slot + MIN_INTERVAL_MS;

    const wait = slot - now;
    if (wait > 0)
        await new Promise(resolve => { setTimeout(resolve, wait) });

    // A Retry-After that landed while this request waited holds it too
    if (Date.now() < heldUntil)
        return pace();
}

async function request<T>(url: string) {
    await pace();

    try {
        return await axios.get<T>(url, { headers: { 'User-Agent': USER_AGENT }, timeout: REQUEST_TIMEOUT_MS });
    } catch (error) {
        // The wait is the server's, so it holds every request, not only this one's retry
        const hold = retryAfterMs(error);
        if (hold !== undefined) {
            heldUntil = Math.max(heldUntil, Date.now() + hold);
            nextSlotAt = Math.max(nextSlotAt, heldUntil);
        }

        throw error;
    }
}

/** A GET against MusicBrainz, identified and paced; every MusicBrainz call goes through here so neither is forgotten. */
export async function musicBrainzGet<T>(url: string) {
    // The same transient error, so callers still answer "unavailable" and the job retries next run
    if (Date.now() < downUntil)
        throw downError;

    // Paced inside the retry, so each retry takes its own slot
    for (let attempt = 0; ; attempt++) {
        try {
            return await request<T>(url);
        } catch (error) {
            if (attempt >= retriesFor(error))
                throw giveUp(error);

            await new Promise(resolve => { setTimeout(resolve, RETRY_DELAY_MS * 2 ** attempt) });
        }
    }
}

/** A transient failure that has used up its retries starts an outage; the error goes back to the caller either way. */
function giveUp(error: unknown) {
    if (isTransientError(error)) {
        downUntil = Date.now() + DOWN_FOR_MS;
        downError = error;
    }

    return error;
}

function retriesFor(error: unknown) {
    if (!isTransientError(error))
        return 0;

    return axios.isAxiosError(error) && error.response ? BUSY_RETRIES : NO_ANSWER_RETRIES;
}
