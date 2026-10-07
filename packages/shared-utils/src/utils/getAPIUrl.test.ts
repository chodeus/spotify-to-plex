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

    // The token goes wherever this points, so a path must never change the host
    it('keeps "@host" in a path on the server', () => {
        expect(getAPIUrl('http://10.0.0.5:32400', '@evil.example/x')).toBe('http://10.0.0.5:32400/@evil.example/x');
    });

    it('refuses a path that is a whole URL of its own', () => {
        expect(() => getAPIUrl('http://10.0.0.5:32400', '//evil.example/x')).toThrow('leaves the server');
        expect(() => getAPIUrl('http://10.0.0.5:32400', 'https://evil.example/x')).toThrow('leaves the server');
    });

    it('keeps a Plex web link\'s fragment and an encoded query', () => {
        const link = `/web/index.html#!/server/abc/playlist?key=${encodeURIComponent('/playlists/1')}`;

        expect(getAPIUrl('http://10.0.0.5:32400', link)).toBe(`http://10.0.0.5:32400${link}`);
        expect(getAPIUrl('http://10.0.0.5:32400', '/hubs/search?query=a%20b&limit=5')).toBe('http://10.0.0.5:32400/hubs/search?query=a%20b&limit=5');
    });
});
