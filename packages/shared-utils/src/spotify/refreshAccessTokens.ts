import { getStorageDir } from "../utils/getStorageDir"
import { SpotifyCredentials } from "@spotify-to-plex/shared-types/spotify/SpotifyCredentials"
import axios from "axios"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { decrypt } from "../security/decrypt";
import { encrypt } from "../security/encrypt"
import { writeJsonFileAtomic } from "../utils/writeJsonFileAtomic"
import { waitForLock } from "../utils/syncLock"

// A token is used for a while after it is read - paging a large playlist, searching its tracks -
// so one that is about to expire is refreshed now, rather than failing with a 401 partway through
export const REFRESH_MARGIN_MS = 5 * 60 * 1000

// The web app and the scheduler each refresh, and a refresh token sent twice can revoke the sign-in:
// one refresh at a time across processes; one that waited re-reads the file and finds nothing due
const LOCK_NAME = 'spotify-token-refresh'
// Long enough for a holder refreshing several users, each request capped at 15 s
export const REFRESH_LOCK_WAIT_MS = 60_000

// Calls in this process share one refresh rather than queueing on the lock behind each other
let inFlight: Promise<void> | undefined

export async function refreshAccessTokens() {
    inFlight ??= refreshLocked().finally(() => { inFlight = undefined })

    return inFlight
}

async function refreshLocked() {
    // A hung holder or a lock that can't be made must not stop every sync: refresh as before the lock
    let release: (() => void) | undefined
    try {
        release = await waitForLock(LOCK_NAME, REFRESH_LOCK_WAIT_MS)
        if (!release)
            console.warn(`⚠️  Another token refresh still running after ${REFRESH_LOCK_WAIT_MS / 1000} s; refreshing anyway`)
    } catch (e) {
        console.warn(`⚠️  Token refresh lock unavailable; refreshing without it:`, e instanceof Error ? e.message : e)
    }

    try {
        await refreshTokens()
    } finally {
        release?.()
    }
}

async function refreshTokens() {
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
        if (!user || now > user.expires_at - REFRESH_MARGIN_MS) {

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