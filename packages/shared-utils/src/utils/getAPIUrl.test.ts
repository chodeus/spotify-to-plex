import { describe, expect, it } from 'vitest';
import { getAPIUrl } from './getAPIUrl';

describe('getAPIUrl', () => {
    it('joins a server URL with a port and a path', () => {
        expect(getAPIUrl('http://10.0.0.5:32400', '/library/metadata/1')).toBe('http://10.0.0.5:32400/library/metadata/1');
    });

    // Plex custom access URLs behind a reverse proxy carry no port
    it('accepts an https URL on the default port', () => {
        expect(getAPIUrl('https://plex.example.com', '/hubs/search')).toBe('https://plex.example.com/hubs/search');
    });

    it('drops any path the server URL carried', () => {
        expect(getAPIUrl('https://plex.example.com:32400/web/index.html', '/playlists')).toBe('https://plex.example.com:32400/playlists');
    });

    it('refuses a URL that is not http or https', () => {
        expect(() => getAPIUrl('ftp://plex.example.com', '/x')).toThrow('http:// or https://');
    });
});
