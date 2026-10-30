import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { HubSearchResult } from '../types/actions/HubSearchResult';
import type { PlexMusicSearchApproach } from '../types/PlexMusicSearchApproach';
import type { PlexMusicSearchConfig } from '../types/PlexMusicSearchConfig';

vi.mock('../utils/searching/searchForTrack', () => ({ searchForTrack: vi.fn() }));

const { searchForTrack } = await import('../utils/searching/searchForTrack');
const { search } = await import('./search');

const searchForTrackMock = searchForTrack as unknown as Mock;

const GUARDED = [
    'artist:match AND title:match AND duration:similarity>=0.65 AND version:match',
    'artist:match AND title:contains AND duration:similarity>=0.65 AND version:match'
];
const NORMAL_THEN_TRIMMED: PlexMusicSearchApproach[] = [{ id: 'normal' }, { id: 'trimmed', trim: true }];

const configWith = (matchFilters: string[], searchApproaches = NORMAL_THEN_TRIMMED): PlexMusicSearchConfig => ({
    uri: 'http://192.168.1.20:32400',
    token: 'token',
    searchApproaches,
    musicSearchConfig: {
        matchFilters,
        textProcessing: { filterOutWords: ['radio edit'], filterOutQuotes: [], cutOffSeparators: ['(', ' - '] },
        searchApproaches: [],
        options: { enableCaching: false, maxCacheSize: 0, debugMode: false }
    }
});

const copy = (key: string, title: string, seconds: number, album = 'Paper Lanterns'): HubSearchResult => ({
    type: 'track',
    id: `/library/metadata/${key}`,
    ratingKey: key,
    guid: `plex://track/${key}`,
    score: 1,
    image: '',
    title,
    duration_ms: seconds * 1000,
    album: { guid: '', id: '', title: album, year: 2020, image: '' },
    artist: { guid: '', id: '', title: 'Artist', image: '' }
});

const ALBUM_MIX = copy('1', 'Paper Lanterns', 300);
const RADIO_EDIT = copy('2', 'Paper Lanterns (Radio Edit)', 210);

// Plex answers by the query text, so each approach sees its own copies
const plexAnswers = (byQuery: Record<string, HubSearchResult[]>) => {
    searchForTrackMock.mockImplementation((_uri: string, _token: string, _artist: string, track: string) =>
        Promise.resolve(byQuery[track] ?? []));
};

const wanted = (title: string, seconds?: number) => ({
    id: 'spotify-1', title, artists: ['Artist'], album: 'Paper Lanterns', duration_ms: seconds && seconds * 1000
});

const resultKeys = async (config: PlexMusicSearchConfig, track: ReturnType<typeof wanted>) => {
    const [response] = await search(config, [track]);

    return response?.result.map(item => item.ratingKey ?? item.id.split('/').pop());
};

describe('search', () => {

    beforeEach(() => {
        searchForTrackMock.mockReset();
    });

    it('puts a copy as long as the wanted track ahead of a closer album on another edit', async () => {
        plexAnswers({ 'paper lanterns': [ALBUM_MIX, copy('3', 'Paper Lanterns', 210, 'Dance Hits')] });

        expect(await resultKeys(configWith(GUARDED), wanted('Paper Lanterns', 210))).toEqual(['3', '1']);
    });

    it('takes a later filter\'s copy of the wanted edit over an earlier filter\'s other edit', async () => {
        // The album mix passes title:match; the radio edit only passes title:contains
        plexAnswers({ 'paper lanterns': [ALBUM_MIX, RADIO_EDIT] });

        expect(await resultKeys(configWith(GUARDED, [{ id: 'trimmed', trim: true }]), wanted('Paper Lanterns - Radio Edit', 210))).toEqual(['2', '1']);
    });

    it('keeps searching when the first approach finds only another edit', async () => {
        plexAnswers({ 'paper lanterns - radio edit': [ALBUM_MIX], 'paper lanterns': [ALBUM_MIX, RADIO_EDIT] });

        expect(await resultKeys(configWith(GUARDED), wanted('Paper Lanterns - Radio Edit', 210))).toEqual(['2', '1']);
    });

    it('keeps the first result when no approach finds the wanted edit', async () => {
        plexAnswers({ 'paper lanterns - radio edit': [ALBUM_MIX], 'paper lanterns': [copy('5', 'Paper Lanterns', 360)] });

        expect(await resultKeys(configWith(GUARDED), wanted('Paper Lanterns - Radio Edit', 210))).toEqual(['1']);
    });

    it('never trades the found copy for another song that is merely the same length', async () => {
        plexAnswers({ 'paper lanterns - radio edit': [ALBUM_MIX], 'paper lanterns': [copy('6', 'Paper Lanterns Forever', 210)] });

        expect(await resultKeys(configWith(GUARDED), wanted('Paper Lanterns - Radio Edit', 210))).toEqual(['1']);
    });

    it('never trades the found copy for another version that is merely the same length', async () => {
        // Without version:match in the filters, the trimmed approach lets a remix through
        plexAnswers({ 'paper lanterns - radio edit': [ALBUM_MIX], 'paper lanterns': [copy('4', 'Paper Lanterns (Other Remix)', 210)] });

        expect(await resultKeys(configWith(['artist:match AND title:contains']), wanted('Paper Lanterns - Radio Edit', 210))).toEqual(['1']);
    });

    it('never reads two titles with no Latin letters as one name', async () => {
        // Both reduce to '', so only the guard keeps the same-length other song from going first
        plexAnswers({ '東京': [copy('7', '東京', 300), copy('8', '大阪', 210, 'Other')] });

        expect(await resultKeys(configWith(GUARDED), wanted('東京', 210))).toEqual(['7', '8']);
    });

    it('stops at the first approach when Spotify gives no duration', async () => {
        // A duration-guarded filter fails closed on a missing duration, so these filters ask for none
        plexAnswers({ 'paper lanterns - radio edit': [ALBUM_MIX] });

        expect(await resultKeys(configWith(['artist:match AND title:contains AND version:match']), wanted('Paper Lanterns - Radio Edit'))).toEqual(['1']);
        expect(searchForTrackMock).toHaveBeenCalledTimes(1);
    });

    it('keeps the first result, not a failure, when a later approach errors', async () => {
        searchForTrackMock.mockImplementation((_uri: string, _token: string, _artist: string, track: string) =>
            (track == 'paper lanterns' ? Promise.reject(new Error('Plex answered 500')) : Promise.resolve([ALBUM_MIX])));

        const [response] = await search(configWith(GUARDED), [wanted('Paper Lanterns - Radio Edit', 210)]);

        expect(response?.result.map(item => item.id)).toEqual(['/library/metadata/1']);
        expect(response?.failed).toBeUndefined();
    });

    it('reports a failed search when every approach errored', async () => {
        searchForTrackMock.mockRejectedValue(new Error('Plex unreachable'));

        const [response] = await search(configWith(GUARDED), [wanted('Paper Lanterns - Radio Edit', 210)]);

        expect(response?.result).toEqual([]);
        expect(response?.failed).toBe(true);
    });

});
