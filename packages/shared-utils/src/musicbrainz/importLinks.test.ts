import { describe, expect, it } from 'vitest';
import { harmonyImportUrl, isSpotifyId, musicBrainzSearchUrl } from './importLinks';

describe('harmonyImportUrl', () => {
    // The form Harmony's own page submits: the release url, then every provider to combine
    it('links Harmony to the Spotify album, url-encoded, with a region and every provider', () => {
        expect(harmonyImportUrl('1WUQvJMTzdN3MmELwmMJFL')).toBe('https://harmony.pulsewidth.org.uk/release?url=https%3A%2F%2Fopen.spotify.com%2Falbum%2F1WUQvJMTzdN3MmELwmMJFL&gtin=&region=US&musicbrainz=&discogs=&deezer=&spotify=&tidal=&qobuz=&beatport=');
        expect(harmonyImportUrl('72PfrevnGAsfQXknMYKGVu', 'GB,US')).toContain('&region=GB%2CUS&');
    });

    // The Lidarr sync logs "unknown" for albums it cannot key; a uri or url is not a bare id either
    it('gives no link without a bare album id', () => {
        expect(harmonyImportUrl(undefined)).toBeUndefined();
        expect(harmonyImportUrl('unknown')).toBeUndefined();
        expect(harmonyImportUrl('spotify:album:72PfrevnGAsfQXknMYKGVu')).toBeUndefined();
        expect(harmonyImportUrl('https://open.spotify.com/album/72PfrevnGAsfQXknMYKGVu')).toBeUndefined();
    });
});

describe('isSpotifyId', () => {
    it('accepts 22 base-62 characters only', () => {
        expect(isSpotifyId('7BXKgh6qHpnNCx3Vkxj8jN')).toBe(true);
        expect(isSpotifyId('7BXKgh6qHpnNCx3Vkxj8j')).toBe(false);
        expect(isSpotifyId('7BXKgh6qHpnNCx3Vkxj8j!')).toBe(false);
        expect(isSpotifyId(42)).toBe(false);
    });
});

describe('musicBrainzSearchUrl', () => {
    it('searches release groups by album and artist', () => {
        const url = new URL(musicBrainzSearchUrl('Locked Years', 'Deathwish'));
        expect(url.origin + url.pathname).toBe('https://musicbrainz.org/search');
        expect(url.searchParams.get('query')).toBe('Deathwish Locked Years');
        expect(url.searchParams.get('type')).toBe('release_group');
    });
});
