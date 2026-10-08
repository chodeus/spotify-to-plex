import { getStorageDir } from "../utils/getStorageDir"
import { SpotifyCredentials } from "@spotify-to-plex/shared-types/spotify/SpotifyCredentials"
import axios from "axios"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { decrypt } from "../security/decrypt";
import { encrypt } from "../security/encrypt"
import { writeJsonFileAtomic } from "../utils/writeJsonFileAtomic"

export async function refreshAccessTokens() {
    const credentialsPath = join(getStorageDir(), 'spotify.json')
    if (!existsSync(credentialsPath))
        throw new Error("No users are currently connected.");

    const clientId = process.env.SPOTIFY_API_CLIENT_ID?.trim()
    const clientSecret = process.env.SPOTIFY_API_CLIENT_SECRET?.trim()

    if (!clientId)
        throw new Error(`Missing environment variables: SPOTIFY_API_CLIENT_ID`)

    if (!clientSecret)
        throw new Error(`Missing environment variables: SPOTIFY_API_CLIENT_SECRET`)

    const users: SpotifyCredentials[] = JSON.parse(readFileSync(credentialsPath, 'utf8'))
    const now = Date.now()

    const newUsers: SpotifyCredentials[] = []

    for (let i = 0; i < users.length; i++) {
        const user = users[i];
        if (!user || now > user.expires_at) {

            try {
                if (!user?.access_token?.refresh_token)
                    continue;

                const refreshToken = decrypt(user.access_token.refresh_token);

                const response = await axios.post(
                    'https://accounts.spotify.com/api/token',
                    new URLSearchParams({
                        grant_type: 'refresh_token',
                        refresh_token: refreshToken,
                        client_id: clientId,
                        client_secret: clientSecret
                    }),
                    {
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded',
                        },
                        // Every playlist load waits on this, so a hung Spotify endpoint would hang the sync
                        timeout: 15_000,
                    }
                );

                const { access_token, expires_in, refresh_token, token_type } = response.data;

                const newRefreshToken = refresh_token ? encrypt(refresh_token) : "";
                newUsers.push({
                    user: user.user,
                    access_token: {
                        access_token: encrypt(access_token),
                        refresh_token: newRefreshToken || user.access_token.refresh_token,
                        expires_in,
                        token_type
                    },
                    expires_at: now + (expires_in * 1000)
                })
            } catch (e) {
                console.error(`⚠️  Failed to refresh token for user ${user?.user?.id}:`, e instanceof Error ? e.message : e)
            }
        }
    }

    if (newUsers.length == 0)
        return;

    // The refresh waited on Spotify, and the web app may have added, removed or relabelled
    // a user since the read above: write the new tokens into the file as it is now
    const current: SpotifyCredentials[] = JSON.parse(readFileSync(credentialsPath, 'utf8'))

    for (const credential of current) {
        const refreshed = newUsers.find(newUser => newUser.user.id === credential?.user?.id)
        const read = users.find(user => user?.user?.id === credential?.user?.id)
        // Tokens written since the read come from a fresh sign-in, which outranks this refresh
        if (!refreshed || JSON.stringify(credential.access_token) !== JSON.stringify(read?.access_token))
            continue;

        credential.access_token = refreshed.access_token
        credential.expires_at = refreshed.expires_at
    }

    writeJsonFileAtomic(credentialsPath, current)

}