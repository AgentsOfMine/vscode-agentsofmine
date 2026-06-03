import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface DetectionResult {
  found: boolean;
  path: string | null;
  version: string | null;
}

export async function detectCollector(): Promise<DetectionResult> {
  try {
    const { stdout } = await execFileAsync('aom', ['--version'], { timeout: 5000 });
    const version = stdout.trim() || null;
    const path = await resolveAomPath();
    return { found: true, path, version };
  } catch {
    return { found: false, path: null, version: null };
  }
}

async function resolveAomPath(): Promise<string | null> {
  const cmd = process.platform === 'win32' ? 'where' : 'which';
  try {
    const { stdout } = await execFileAsync(cmd, ['aom'], { timeout: 3000 });
    return stdout.trim().split('\n')[0] ?? null;
  } catch {
    return null;
  }
}
