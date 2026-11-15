// A fake Plex library that, like the real one, ties tracks to a collection by its title, ignoring case
export const plex = {
    collections: new Map<string, { title: string, section: number }>(),
    tags: new Map<string, Set<string>>(),
    playlists: new Map<string, string[]>(),
    sorts: new Map<string, string>(),
    nextKey: 900,
    ignored: new Set<string>(),
    dead: new Set<string>(),
    fail: undefined as undefined | ((method: string, path: string) => boolean),
    requests: [] as string[],
};

export function resetPlex() {
    for (const store of [plex.collections, plex.tags, plex.playlists, plex.sorts, plex.ignored, plex.dead])
        store.clear();
    plex.nextKey = 900;
    plex.fail = undefined;
    plex.requests = [];
}

const httpError = (status: number) => Object.assign(new Error(`Request failed with status code ${status}`), { response: { status } });
const ok = () => ({ data: {} });
const created = (ratingKey: string) => ({ data: { MediaContainer: { size: 1, Metadata: [{ ratingKey }] } } });
const route = (path: string, pattern: RegExp) => pattern.exec(path)?.[1];
const libraryKey = (uri: string) => uri.slice(uri.indexOf('/library/'));

export function membersOf(ratingKey: string) {
    const title = plex.collections.get(ratingKey)?.title.toLowerCase();

    return [...plex.tags.entries()].filter(([, tags]) => !!title && tags.has(title)).map(([n]) => n)
        .sort((a, b) => Number(a) - Number(b));
}
export function tag(n: string, title: string) {
    if (!plex.ignored.has(n) && !plex.dead.has(n))
        plex.tags.set(n, (plex.tags.get(n) ?? new Set()).add(title.toLowerCase()));
}
export function untag(n: string, title: string) {
    plex.tags.get(n)?.delete(title.toLowerCase());
}
// Plex takes a comma list of ratingKeys; a URL naming too many is refused
function keysIn(uri: string) {
    const keys = uri.slice(uri.indexOf('/library/metadata/') + '/library/metadata/'.length).split(',');
    if (keys.length > 100)
        throw httpError(414);

    return keys;
}
function request(method: string, url: string, token: string) {
    const parsed = new URL(url);
    plex.requests.push(`${method} ${parsed.pathname} ${token}`);
    if (plex.fail?.(method, parsed.pathname))
        throw httpError(401);

    return parsed;
}
function libraryItem(n: string) {
    const collection = plex.collections.get(n);
    if (collection)
        return { ratingKey: n, key: `/library/metadata/${n}`, type: 'collection', title: collection.title, librarySectionID: collection.section };

    if (Number(n) < 900 && !plex.dead.has(n))
        return { ratingKey: n, key: `/library/metadata/${n}`, type: 'track', title: `t${n}`, librarySectionID: 6 };

    throw httpError(404);
}

export const fakeAxiosRequest = {
    get: async (url: string, token: string) => {
        const { pathname } = request('GET', url, token);
        if (pathname.endsWith('/posters'))
            return { data: { MediaContainer: { size: 1 } } };

        const item = route(pathname, /^\/library\/metadata\/(\d+)$/);
        if (item)
            return { data: { MediaContainer: { size: 1, Metadata: [libraryItem(item)] } } };

        const section = route(pathname, /^\/library\/sections\/(\d+)\/collections$/);
        if (section) {
            const list = [...plex.collections].filter(([, c]) => String(c.section) === section).map(([ratingKey, c]) => ({ ratingKey, title: c.title }));

            return { data: { MediaContainer: { size: list.length, ...(list.length > 0 ? { Metadata: list } : {}) } } };
        }

        const children = route(pathname, /^\/library\/collections\/(\d+)\/children$/);
        if (children)
            return { data: { MediaContainer: { Metadata: membersOf(children).map(n => ({ key: `/library/metadata/${n}` })) } } };

        if (pathname === '/playlists')
            return { data: { MediaContainer: { Metadata: [...plex.playlists.keys()].map(ratingKey => ({ ratingKey, title: 'Mix' })) } } };

        const playlist = route(pathname, /^\/playlists\/(\d+)\/items$/);
        if (playlist)
            return { data: { MediaContainer: { Metadata: (plex.playlists.get(playlist) ?? []).map(key => ({ key })) } } };

        throw new Error(`unexpected GET ${pathname}`);
    },
    post: async (url: string, token: string) => {
        const parsed = request('POST', url, token);
        if (parsed.pathname.endsWith('/posters'))
            return ok();

        const ratingKey = String(plex.nextKey++);
        const uri = parsed.searchParams.get('uri') ?? '';
        if (parsed.pathname === '/playlists') {
            plex.playlists.set(ratingKey, [libraryKey(uri)]);

            return created(ratingKey);
        }

        if (parsed.pathname === '/library/collections') {
            const title = parsed.searchParams.get('title') ?? '';
            plex.collections.set(ratingKey, { title, section: Number(parsed.searchParams.get('sectionId')) });

            for (const n of keysIn(uri))
                tag(n, title);

            return created(ratingKey);
        }

        throw new Error(`unexpected POST ${parsed.pathname}`);
    },
    put: async (url: string, token: string) => {
        const parsed = request('PUT', url, token);
        const items = route(parsed.pathname, /^\/library\/collections\/(\d+)\/items$/);
        if (items) {
            const title = plex.collections.get(items)?.title ?? '';
            const batch = keysIn(parsed.searchParams.get('uri') ?? '');
            // Plex skips keys it no longer has, and refuses a list holding none it has
            if (batch.every(n => plex.dead.has(n)))
                throw httpError(400);

            for (const n of batch)
                tag(n, title);

            return ok();
        }

        if (route(parsed.pathname, /^\/library\/sections\/(\d+)\/all$/)) {
            const id = parsed.searchParams.get('id') ?? '';
            const collection = plex.collections.get(id);
            const members = membersOf(id);
            if (!collection)
                throw httpError(404);

            for (const n of members)
                untag(n, collection.title);
            collection.title = parsed.searchParams.get('title.value') ?? '';

            for (const n of members)
                tag(n, collection.title);

            return ok();
        }

        const playlist = route(parsed.pathname, /^\/playlists\/(\d+)\/items$/);
        if (playlist) {
            plex.playlists.get(playlist)?.push(libraryKey(parsed.searchParams.get('uri') ?? ''));

            return ok();
        }

        const prefs = route(parsed.pathname, /^\/library\/metadata\/(\d+)\/prefs$/);
        if (prefs) {
            plex.sorts.set(prefs, parsed.searchParams.get('collectionSort') ?? '');

            return ok();
        }

        if (/^\/playlists\/\d+$/.test(parsed.pathname) || parsed.pathname.endsWith('/poster'))
            return ok();

        throw new Error(`unexpected PUT ${parsed.pathname}`);
    },
    delete: async (url: string, token: string) => {
        const parsed = request('DELETE', url, token);
        const child = /^\/library\/collections\/(\d+)\/children\/(\d+)$/.exec(parsed.pathname);
        if (child) {
            untag(child[2] ?? '', plex.collections.get(child[1] ?? '')?.title ?? '');

            return ok();
        }

        const playlist = route(parsed.pathname, /^\/playlists\/(\d+)\/items$/);
        if (playlist) {
            plex.playlists.set(playlist, []);

            return ok();
        }

        throw new Error(`unexpected DELETE ${parsed.pathname}`);
    },
};
