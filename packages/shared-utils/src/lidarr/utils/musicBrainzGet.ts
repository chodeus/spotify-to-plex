import axios from 'axios';
import { withRetry } from './withRetry';

// MusicBrainz throttles clients that do not identify themselves and asks for
// contact details in the agent string. Without one a full Lidarr run draws
// enough 503s to lose a quarter of its albums to "unavailable"
const USER_AGENT = 'spotify-to-plex/1.0 ( https://github.com/jjdenhertog/spotify-to-plex )';

/**
 * A GET against the MusicBrainz web service: identified, and retried once on a
 * transient failure. Every MusicBrainz call goes through here so the agent
 * string cannot be forgotten at a new call site.
 */
export async function musicBrainzGet<T>(url: string) {
    return withRetry(() => axios.get<T>(url, { headers: { 'User-Agent': USER_AGENT } }));
}
