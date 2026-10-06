import fs from 'fs-extra';
const { ensureDir } = fs;
import { join } from 'node:path';
import { writeJsonFileAtomic } from '@spotify-to-plex/shared-utils/utils/writeJsonFileAtomic';
import { TextProcessingConfig } from '../types/TextProcessingConfig';

const TEXT_PROCESSING_FILE = 'text-processing.json';

export async function updateTextProcessing(storageDir: string, config: TextProcessingConfig) {
    await ensureDir(storageDir);
    writeJsonFileAtomic(join(storageDir, TEXT_PROCESSING_FILE), config, 2);

    return config;
}
