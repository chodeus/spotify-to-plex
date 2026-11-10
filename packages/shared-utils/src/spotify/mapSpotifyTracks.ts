import { PlaylistedTrack, SavedTrack, Track } from "@spotify/web-api-ts-sdk";

/** One mapping for every page of a playlist or of Liked Songs, so "A, B" splits the same way on each. */
export function mapSpotifyTracks(items: (PlaylistedTrack<Track> | SavedTrack)[]) {
    return items
        .map(item => {
            const track: Track | undefined = (item as any).item ?? (item as any).track;
            if (!track || typeof track !== 'object')
                return null;

            // Local files have no id but do have a spotify:local: uri
            if (!track.id && !track.uri)
                return null;

            const artists = track.artists?.flatMap(artist => artist.name.split(',').map(name => name.trim()));

            return {
                id: track.id || track.uri,
                title: track.name,
                artist: track.artists?.[0]?.name || 'Unknown',
                album: track.album?.name || 'Unknown',
                artists: artists || [],
                // Unsplit: "Above, Below" is one band, which the split above makes "Above" and "Below".
                // MusicBrainz and Lidarr look the album up by this name
                album_artist: track.album?.artists?.[0]?.name,
                album_id: track.album?.id || 'unknown',
                duration_ms: track.duration_ms,
                isrc: track.external_ids?.isrc
            }
        })
        .filter((track) => !!track);
}
