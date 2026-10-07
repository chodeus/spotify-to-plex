import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Runs a package.json script the way `npm run` does, so the image needs no npm. */
export function runScript(name: string, packageDir = '/app/apps/sync-worker') {
    const { scripts } = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8')) as { scripts?: Record<string, string> };
    const script = scripts?.[name];
    if (!script)
        throw new Error(`No "${name}" script in ${join(packageDir, 'package.json')}`);

    return spawn(script, {
        cwd: packageDir,
        stdio: 'inherit',
        shell: true,
        env: { ...process.env, PATH: `${join(packageDir, 'node_modules', '.bin')}:${process.env.PATH ?? ''}` }
    });
}
