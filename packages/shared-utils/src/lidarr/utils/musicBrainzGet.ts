import axios from 'axios';
import { withRetry } from './withRetry';

// MusicBrainz asks anonymous clients to identify themselves, and answers 403 to
// a request with no agent string at all
const USER_AGENT = 'spotify-to-plex/1.0 ( https://github.com/jjdenhertog/spotify-to-plex )';

// MusicBrainz allows roughly one request a second per address and answers 503
// once you outrun it. Pacing lived at some call sites and not others, so an
// album needing a URL lookup and two searches fired three requests in two
// seconds and lost a quarter of a run to "unavailable"
const MIN_INTERVAL_MS = 1100;

let nextSlotAt = 0;

/**
 * Wait for this request's turn. The slot is claimed synchronously, before any
 * awaiting, so two callers in flight at once take consecutive slots rather than
 * both reading the same "last request" time and going out together.
 */
async function pace() {
    const now = Date.now();
    const slot = Math.max(now, nextSlotAt);
    nextSlotAt = slot + MIN_INTERVAL_MS;

    const wait = slot - now;
    if (wait > 0)
        await new Promise(resolve => { setTimeout(resolve, wait) });
}

/**
 * A GET against the MusicBrainz web service: identified, paced against the rate
 * limit, and retried once on a transient failure. Every MusicBrainz call goes
 * through here, so neither the agent string nor the spacing can be forgotten at
 * a new call site - which is how both came to be missing in the first place.
 */
export async function musicBrainzGet<T>(url: string) {
    await pace();

    return withRetry(() => axios.get<T>(url, { headers: { 'User-Agent': USER_AGENT } }));
}
