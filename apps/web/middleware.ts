import { NextResponse, type NextRequest } from 'next/server';

/** Refuses API requests another site's page made: the API has no login, so a form or image elsewhere could drive it. */
export function middleware(request: NextRequest) {
    // Browsers always send it; its absence means a script or tool, which a page cannot impersonate
    const site = request.headers.get('sec-fetch-site');
    if (!site || site === 'same-origin' || site === 'none')
        return NextResponse.next();

    // Spotify's sign-in lands here from its callback page, which lives on another site
    if (request.method === 'GET' && request.nextUrl.pathname === '/api/spotify/token')
        return NextResponse.next();

    return new NextResponse(null, { status: 403 });
}

export const config = {
    matcher: '/api/:path*',
};
