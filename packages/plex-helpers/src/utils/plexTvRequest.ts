// The token goes in a header, never the URL, where request logs would keep it
export function plexTvRequest(token: string) {
    return {
        params: {
            "X-Plex-Product": "Spotify to Plex",
            "X-Plex-Client-Identifier": process.env.PLEX_APP_ID,
        },
        headers: { "X-Plex-Token": token },
    };
}
