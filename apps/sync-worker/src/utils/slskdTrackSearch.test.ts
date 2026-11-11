import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_MUSIC_SEARCH_CONFIG } from '@spotify-to-plex/music-search/config/default-config';
import { setMusicSearchConfig as setMatchFilters } from '@spotify-to-plex/music-search/functions/setMusicSearchConfig';
import { clearSearchCache, clearState, newTrackSearch, setState } from '@spotify-to-plex/slskd-music-search';

type Peer = { username: string; uploadSpeed?: number; queueLength?: number; hasFreeUploadSlot?: boolean; files: { filename: string; length?: number }[] };

const post = vi.fn();
let peers: Peer[] = [];

// slskd itself, at the HTTP layer: everything above it is the real search
function fakeSlskd() {
    post.mockResolvedValue({ data: { id: 'search-1' } });
    vi.spyOn(axios, 'create').mockReturnValue({
        post,
        delete: vi.fn(async () => ({})),
        get: vi.fn(async (url: string) => {
            if (!url.endsWith('/responses'))
                return { data: { state: 'Completed, TimedOut' } };

            return { data: peers.map(peer => ({ ...peer, files: peer.files.map(file => ({ size: 1, extension: '', ...file })) })) };
        })
    } as unknown as ReturnType<typeof axios.create>);
}

function configure(matchFilters: string[]) {
    const musicSearchConfig = { ...DEFAULT_MUSIC_SEARCH_CONFIG, matchFilters };
    setMatchFilters(musicSearchConfig);
    setState({ baseUrl: 'http://slskd.test', apiKey: 'key' }, {
        baseUrl: 'http://slskd.test',
        apiKey: 'key',
        searchApproaches: [{ id: 'normal' }],
        textProcessing: musicSearchConfig.textProcessing,
        musicSearchConfig,
        searchTimeout: 5000
    });
}

const approaches = [{ id: 'normal' }];
const wanted = { id: 'spotify-1', artists: ['Some Band'], title: 'Some Song', album: 'Album', duration_ms: 200_000 };
const file = (folder: string, extension = 'flac') => `Music\\${folder}\\Some Band - Some Song.${extension}`;
const found = async (track = wanted) => {
    const { result } = await newTrackSearch(approaches, track);

    return result.map(item => item.username);
};

describe('slskd track search', () => {
    beforeEach(() => {
        peers = [];
        post.mockReset();
        fakeSlskd();
        vi.spyOn(console, 'log').mockImplementation(() => { /* expected */ });
        configure(['artist:match AND title:match']);
    });

    afterEach(() => {
        clearSearchCache();
        clearState();
        vi.restoreAllMocks();
    });

    it('asks slskd for the configured search time', async () => {
        await found();

        expect(post.mock.calls[0]?.[1]).toMatchObject({ searchText: 'some band some song', searchTimeout: 5000 });
        expect(post.mock.calls[0]?.[1]).not.toHaveProperty('timeout');
    });

    // With no length on either side every duration-guarded row failed, so such a config found nothing on slskd
    it('checks a file against the wanted length under a duration filter', async () => {
        configure(['artist:match AND title:match AND duration:similarity>=0.65']);
        peers = [
            { username: 'extended', files: [{ filename: file('a'), length: 520 }] },
            { username: 'right', files: [{ filename: file('b'), length: 201 }] }
        ];

        await expect(found()).resolves.toEqual(['right']);
    });

    it('ranks the peer most likely to deliver first within a format', async () => {
        peers = [
            { username: 'busy', uploadSpeed: 9_000_000, queueLength: 80, hasFreeUploadSlot: true, files: [{ filename: file('a') }] },
            { username: 'no-slot', uploadSpeed: 9_000_000, queueLength: 0, hasFreeUploadSlot: false, files: [{ filename: file('b') }] },
            { username: 'slow', uploadSpeed: 1000, queueLength: 0, hasFreeUploadSlot: true, files: [{ filename: file('c') }] },
            { username: 'free', uploadSpeed: 500_000, queueLength: 0, hasFreeUploadSlot: true, files: [{ filename: file('d') }] },
            { username: 'free-mp3', uploadSpeed: 9_000_000, queueLength: 0, hasFreeUploadSlot: true, files: [{ filename: file('e', 'mp3') }] }
        ];

        await expect(found()).resolves.toEqual(['free', 'slow', 'no-slot', 'busy', 'free-mp3']);
    });

    it.each([
        ['P!nk', 'So What', 'pink so what'],
        ['The Beatles', 'Help!', 'the beatles help'],
        ['G‐Eazy', 'No Limit', 'g-eazy no limit'],
        ['Artist', 'R&B Song', 'artist r b song']
    ])('searches %s - %s as "%s"', async (artist, title, query) => {
        await found({ ...wanted, artists: [artist], title });

        expect(post.mock.calls[0]?.[1]).toMatchObject({ searchText: query });
    });
});
