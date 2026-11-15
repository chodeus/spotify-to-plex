import { PlexSettings } from '../PlexSettings';
import { getPlexUri } from './getPlexUri';
import { ratingKeyOf } from './ratingKeyOf';

/** One URI naming several items of this server's library, for calls that take a comma list. */
export function getPlexItemsUri(settings: PlexSettings, keys: string[]) {
    return getPlexUri(settings, `/library/metadata/${keys.map(ratingKeyOf).join(',')}`);
}
