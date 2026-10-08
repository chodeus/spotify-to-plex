import axios from 'axios';
import { retryAfterMs } from '@spotify-to-plex/http-client/retryAfterMs';
import { withRetry } from './withRetry';

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

let nextSlotAt = 0;
let heldUntil = 0;

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

/**
 * A GET against the MusicBrainz web service: identified, paced against the rate
 * limit, and retried once on a transient failure. Every MusicBrainz call goes
 * through here, so neither the agent string nor the spacing can be forgotten at
 * a new call site - which is how both came to be missing in the first place.
 */
export function musicBrainzGet<T>(url: string) {
    // Paced inside the retry too: an unpaced retry and the next request went out together and drew another 503
    return withRetry(() => request<T>(url));
}
