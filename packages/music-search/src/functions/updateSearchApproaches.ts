import fs from 'fs-extra';
const { ensureDir } = fs;
import { join } from 'node:path';
import { writeJsonFileAtomic } from '@spotify-to-plex/shared-utils/utils/writeJsonFileAtomic';
import { SearchApproachConfig } from '../types/SearchApproachConfig';

const SEARCH_APPROACHES_FILE = 'search-approaches.json';

export async function updateSearchApproaches(storageDir: string, approaches: SearchApproachConfig[]) {
    await ensureDir(storageDir);
    writeJsonFileAtomic(join(storageDir, SEARCH_APPROACHES_FILE), approaches, 2);

    return approaches;
}
