import { PlexMusicSearchConfig } from "../types/PlexMusicSearchConfig";
import { HubSearchResult } from "../types/actions/HubSearchResult";
import { setMusicSearchConfig as setGlobalMusicSearchConfig } from "@spotify-to-plex/music-search/functions/setMusicSearchConfig";
import { setConfig as setGlobalConfig } from "@spotify-to-plex/music-search/functions/setConfig";

type PlexMusicSearchState = {
    config?: PlexMusicSearchConfig;
    cache: { id: string, result: HubSearchResult[] }[];
}

const state: PlexMusicSearchState = {
    config: undefined,
    cache: []
};

export function getState(): PlexMusicSearchState {
    return state;
}

export function setState(newState: Partial<PlexMusicSearchState>) {
    Object.assign(state, newState);
}


export function resetCache() {
    state.cache = [];
}

export function setMusicSearchConfig(config: PlexMusicSearchConfig) {
    state.config = config;

    setGlobalConfig(config);

    const { musicSearchConfig } = config;
    if (musicSearchConfig)
        setGlobalMusicSearchConfig(musicSearchConfig);
}

export function getConfig(): PlexMusicSearchConfig | undefined {
    return state.config;
}

export function addToCache(id: string, result: HubSearchResult[]) {
    state.cache.push({ id, result });
}

export function getFromCache(id: string) {
    const cached = state.cache.find(item => item.id === id);

    return cached?.result;
}