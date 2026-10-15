/** The bare id of a track id that may be a "spotify:track:<id>" uri. A local file's uri yields its artist, not an id. */
export function spotifyTrackId(id: string) {
    return id.indexOf(":") > -1 ? id.split(":")[2] : id;
}
