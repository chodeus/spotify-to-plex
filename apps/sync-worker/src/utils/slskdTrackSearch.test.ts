import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_MUSIC_SEARCH_CONFIG } from '@spotify-to-plex/music-search/config/default-config';
import { setMusicSearchConfig as setMatchFilters } from '@spotify-to-plex/music-search/functions/setMusicSearchConfig';
import { clearSearchCache, clearState, newTrackSearch, setState } from '@spotify-to-plex/slskd-music-search';

type Peer = { username: string; uploadSpeed?: number; queueLength?: number; hasFreeUploadSlot?: boolean; files: { filename: string; length?: number }[] };

const post = vi.fn();
let peers: Peer[] = [];
let searchState = 'Completed, TimedOut';

// slskd itself, at the HTTP layer: everything above it is the real search
function fakeSlskd() {
    post.mockResolvedValue({ data: { id: 'search-1' } });
    vi.spyOn(axios, 'create').mockReturnValue({
        post,
        delete: vi.fn(async () => ({})),
        get: vi.fn(async (url: string) => {
            if (!url.endsWith('/responses'))
                return { data: { state: searchState } };

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
        searchState = 'Completed, TimedOut';
        post.mockReset();
        fakeSlskd();
        vi.spyOn(console, 'log').mockImplementation(() => { /* expected */ });
        configure(['artist:match AND title:match']);
    });

    afterEach(() => {
        vi.useRealTimers();
        clearSearchCache();
        clearState();
        vi.restoreAllMocks();
    });

    it('asks slskd for the configured search time', async () => {
        await found();

        expect(post.mock.calls[0]?.[1]).toMatchObject({ searchText: 'some band some song', searchTimeout: 5000 });
        expect(post.mock.calls[0]?.[1]).not.toHaveProperty('timeout');
    });

    // A duration-guarded row fails when either side has no length
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

    // A fast peer with a queue starts later than an idle one whose speed was never measured
    it('ranks an idle peer of unknown speed ahead of a fast one with a queue', async () => {
        peers = [
            { username: 'queued', uploadSpeed: 9_000_000, queueLength: 80, hasFreeUploadSlot: true, files: [{ filename: file('a') }] },
            { username: 'idle', uploadSpeed: 0, queueLength: 0, hasFreeUploadSlot: true, files: [{ filename: file('b') }] }
        ];

        await expect(found()).resolves.toEqual(['idle', 'queued']);
    });

    it('keeps the wanted edit ahead of another version from a better peer', async () => {
        configure(['artist:match AND title:contains']);
        peers = [
            { username: 'idle', hasFreeUploadSlot: true, files: [{ filename: 'Music\\a\\Some Band - Some Song (Live).flac', length: 200 }] },
            { username: 'queued', queueLength: 10, files: [{ filename: file('b'), length: 200 }] }
        ];

        await expect(found()).resolves.toEqual(['queued', 'idle']);
    });

    it('takes what slskd has collected when the search outlasts the wait', async () => {
        vi.useFakeTimers();
        searchState = 'InProgress';
        peers = [{ username: 'late', files: [{ filename: file('a') }] }];

        const searching = found();
        await vi.advanceTimersByTimeAsync(30_000);

        await expect(searching).resolves.toEqual(['late']);
    });

    it.each([
        ['P!nk', 'So What', 'pink so what'],
        ['The Beatles', 'Help!', 'the beatles help'],
        ['Joey Bada$$', 'Paper Trail$', 'joey badass paper trails'],
        ['N*E*R*D', 'Lemon', 'nerd lemon'],
        ['G‐Eazy', 'No Limit', 'g-eazy no limit'],
        ['Artist', 'R&B Song', 'artist r b song']
    ])('searches %s - %s as "%s"', async (artist, title, query) => {
        await found({ ...wanted, artists: [artist], title });

        expect(post.mock.calls[0]?.[1]).toMatchObject({ searchText: query });
    });
});
