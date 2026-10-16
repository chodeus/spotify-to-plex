import { describe, expect, it, vi } from 'vitest';

vi.mock('./findMissingTidalTracks', () => ({ findMissingTidalTracks: async (tracks: { id: string }[]) => tracks.map(track => ({ id: track.id, tidal_id: `tidal-${track.id}` })) }));

const { mergeMissingLists, missingListsFor } = await import('./missingLists');

const track = (id: string, extra: object = {}) => ({ id, title: 'Song', album: 'Album', album_id: 'al1', artists: ['Artist'], ...extra });
const lists = (extra: object = {}) => ({ spotify: [], tidal: [], lidarr: [], slskd: [], ...extra });
const album = (name: string, id = 'al1') => ({ artist_name: 'Artist', album_name: name, spotify_album_id: id });
const slskd = (id: string, name = 'Song') => ({ spotify_id: id, artist_name: 'Artist', track_name: name, album_name: 'Album' });

describe('missingListsFor', () => {
    it('lists a missing track for each destination, by its bare spotify id', async () => {
        expect(await missingListsFor([track('spotify:track:a')])).toEqual({
            spotify: ['a'],
            tidal: ['tidal-spotify:track:a'],
            lidarr: [album('Album')],
            slskd: [slskd('a')]
        });
    });

    it('sends a local file to Lidarr only, and a track with no known album to the track lists only', async () => {
        vi.spyOn(console, 'log').mockImplementation(() => { /* expected */ });

        const result = await missingListsFor([track('spotify:local:Artist:Album:Song:200'), track('b', { album_id: 'unknown' })]);

        expect(result.spotify).toEqual(['b']);
        expect(result.lidarr).toEqual([album('Album')]);
        expect(result.slskd).toEqual([slskd('b')]);
    });
});

describe('mergeMissingLists', () => {
    it('lists what two playlists both miss once, as the first listed it', () => {
        const merged = mergeMissingLists([
            lists({ spotify: ['a', 'b'], tidal: ['t1'], lidarr: [album('One')], slskd: [slskd('a')] }),
            lists({ spotify: ['b', 'c'], tidal: ['t1', 't2'], lidarr: [album('One', 'al9'), album('Two')], slskd: [slskd('a', 'Other'), slskd('c')] })
        ]);

        expect(merged).toEqual({
            spotify: ['a', 'b', 'c'],
            tidal: ['t1', 't2'],
            lidarr: [album('One'), album('Two')],
            slskd: [slskd('a'), slskd('c')]
        });
    });

    it('drops a repeat within one playlist', () => {
        expect(mergeMissingLists([lists({ spotify: ['a', 'a'] })]).spotify).toEqual(['a']);
    });

    it('gives empty lists for no playlists', () => {
        expect(mergeMissingLists([])).toEqual(lists());
    });
});
