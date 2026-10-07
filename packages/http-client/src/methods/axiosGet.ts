import axios, { AxiosRequestConfig } from "axios";
import { plexHttpsAgent } from "./plexHttpsAgent";

export function axiosGet<T>(url: string, token: string, config: AxiosRequestConfig = {}) {
    return axios.get<T>(url,
        {
            ...config,
            // eslint-disable-next-line unicorn/numeric-separators-style
            timeout: 10000,
            httpsAgent: plexHttpsAgent(url),
            headers: {
                "X-Plex-Token": token,
            }
        }
    )
}