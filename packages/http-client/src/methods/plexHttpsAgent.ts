import { Agent } from "node:https";
import { isIP } from "node:net";

// Plex's certificate names *.plex.direct hosts, so an IP address can never pass the check
const ipAddressAgent = new Agent({ rejectUnauthorized: false });

// Clearing or filling a long playlist is slow; without any limit a Plex that stops answering hangs the job
export const PLEX_WRITE_TIMEOUT_MS = 30_000;

/** The HTTPS agent for a Plex URL: the default (verifying) one for a hostname, none for an IP address. */
export function plexHttpsAgent(url: string) {
    const host = new URL(url).hostname.replace(/^\[|]$/g, '');

    return isIP(host) ? ipAddressAgent : undefined;
}
