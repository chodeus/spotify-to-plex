import { NextResponse, type NextRequest } from 'next/server';

/** Whether a request came from this app's own page, or from a script or tool rather than any page. */
function fromThisApp(request: NextRequest) {
    const site = request.headers.get('sec-fetch-site');
    if (site)
        return site === 'same-origin' || site === 'none';

    // Over plain http (http://<ip>:9030) browsers send no Sec-Fetch-Site at all, but every
    // cross-origin POST, PUT and DELETE still carries an Origin, which a page cannot forge
    const origin = request.headers.get('origin');
    if (!origin)
        return true;

    const host = request.headers.get('host');
    if (!host)
        return false;

    try {
        // nextUrl's host is the server's own, but its scheme follows the TLS socket or X-Forwarded-Proto
        return new URL(origin).origin === new URL(`${request.nextUrl.protocol}//${host}`).origin;
    } catch {
        // "null" from a sandboxed frame or a file
        return false;
    }
}

/** Refuses API requests another site's page made: the API has no login, so a form or image elsewhere could drive it. */
export function middleware(request: NextRequest) {
    // Spotify's sign-in lands here from its callback page, which lives on another site
    if (request.method === 'GET' && request.nextUrl.pathname === '/api/spotify/token')
        return NextResponse.next();

    return fromThisApp(request) ? NextResponse.next() : new NextResponse(null, { status: 403 });
}

export const config = {
    matcher: '/api/:path*',
};
