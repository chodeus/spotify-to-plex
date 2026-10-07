import axios from "axios";
import { PLEX_WRITE_TIMEOUT_MS, plexHttpsAgent } from "./plexHttpsAgent";

export function axiosPut<T>(url: string, token: string) {
    return axios.put<T>(url, {},
        {
            timeout: PLEX_WRITE_TIMEOUT_MS,
            httpsAgent: plexHttpsAgent(url),
            headers: {
                'Accept': 'application/json',
                "X-Plex-Token": token,
            }
        }
    )
}