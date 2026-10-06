import fs from 'fs-extra';
const { ensureDir } = fs;
import { join } from 'node:path';
import { writeJsonFileAtomic } from '@spotify-to-plex/shared-utils/utils/writeJsonFileAtomic';
import { MatchFilterConfig } from '@spotify-to-plex/shared-types/common/MatchFilterConfig';

const MATCH_FILTERS_FILE = 'match-filters.json';

export async function updateMatchFilters(storageDir: string, filters: MatchFilterConfig[]) {
    await ensureDir(storageDir);
    writeJsonFileAtomic(join(storageDir, MATCH_FILTERS_FILE), filters, 2);

    return filters;
}
