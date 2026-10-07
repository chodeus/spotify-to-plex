export function getAPIUrl(_url: string, path: string) {
    const url = new URL(_url);

    // No port check: a Plex custom access URL on 443 or 80 carries none
    if (url.protocol !== 'http:' && url.protocol !== 'https:')
        throw new Error("The link to the Plex server seems invalid. It should start with http:// or https://")

    // Resolved, not appended: "@host/x" appended to "http://ip:32400" would make host the server
    const target = new URL(path, url.origin);
    if (target.origin !== url.origin)
        throw new Error(`Refusing a Plex path that leaves the server: ${path}`)

    return target.href
}