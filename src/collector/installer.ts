import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as vscode from 'vscode';
import { detectCollector } from './detector.js';

const INSTALL_PROMPT_KEY = 'agentsofmine.collectorInstallPrompted';
const PACKAGE_NAME = 'agentsofmine-collector';
const MIN_COLLECTOR_VERSION = '0.1.0';

const execFileAsync = promisify(execFile);

export type InstallDecision = 'install' | 'skip' | 'already-present' | 'unsupported';

let outputChannel: vscode.OutputChannel | null = null;

function getOutputChannel(): vscode.OutputChannel {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel('AgentsOfMine');
  }
  return outputChannel;
}

export async function ensureCollectorInstalled(
  _context: vscode.ExtensionContext,
): Promise<InstallDecision> {
  const detection = await detectCollector();

  if (detection.found && meetsVersionFloor(detection.version)) {
    return 'already-present';
  }

  if (process.platform === 'win32') {
    void vscode.window.showInformationMessage(
      "AgentsOfMine's collector doesn't support Windows yet.",
    );
    return 'unsupported';
  }

  const hasNodeAndNpm = await checkNodeAndNpm();

  if (!hasNodeAndNpm) {
    await installCollectorInVisibleTerminal();
    return 'install';
  }

  const silentOk = await installCollectorSilently();
  if (silentOk) {
    const recheck = await detectCollector();
    if (recheck.found) {
      return 'install';
    }
  }

  await installCollectorInVisibleTerminal();
  return 'install';
}

async function checkNodeAndNpm(): Promise<boolean> {
  try {
    await execFileAsync('npm', ['--version'], { timeout: 5000 });
    await execFileAsync('node', ['--version'], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

async function installCollectorSilently(): Promise<boolean> {
  return vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Window,
      title: 'Setting up AgentsOfMine…',
    },
    async () => {
      try {
        const { stdout, stderr } = await execFileAsync(
          'npm',
          ['install', '-g', PACKAGE_NAME],
          { timeout: 120000 },
        );
        const channel = getOutputChannel();
        if (stdout.trim()) {
          channel.appendLine(stdout.trim());
        }
        if (stderr.trim()) {
          channel.appendLine(stderr.trim());
        }
        return true;
      } catch (error) {
        const channel = getOutputChannel();
        channel.appendLine(`Silent install of ${PACKAGE_NAME} failed:`);
        if (error instanceof Error) {
          channel.appendLine(error.message);
          const withStreams = error as Error & { stdout?: string; stderr?: string };
          if (withStreams.stdout) {
            channel.appendLine(withStreams.stdout);
          }
          if (withStreams.stderr) {
            channel.appendLine(withStreams.stderr);
          }
        } else {
          channel.appendLine(String(error));
        }
        return false;
      }
    },
  );
}

function installCollectorInVisibleTerminal(): Promise<void> {
  return new Promise((resolve) => {
    const terminal = vscode.window.createTerminal({
      name: 'AgentsOfMine — Install Collector',
      message: `Installing ${PACKAGE_NAME} globally…`,
    });

    terminal.show(true);
    terminal.sendText(`npm install -g ${PACKAGE_NAME}`, false);

    const disposable = vscode.window.onDidCloseTerminal((closed) => {
      if (closed === terminal) {
        disposable.dispose();
        resolve();
      }
    });
  });
}

// Numeric-tuple compare: split on '.', compare major/minor/patch as integers.
function meetsVersionFloor(version: string | null): boolean {
  if (!version) {
    return true;
  }
  const cleaned = version.trim().replace(/^v/, '');
  const currentParts = cleaned.split('.').map((part) => Number.parseInt(part, 10));
  const floorParts = MIN_COLLECTOR_VERSION.split('.').map((part) => Number.parseInt(part, 10));

  if (currentParts.length < 3 || currentParts.some((n) => Number.isNaN(n))) {
    return true;
  }

  for (let i = 0; i < floorParts.length; i += 1) {
    const current = currentParts[i] ?? 0;
    const floor = floorParts[i] ?? 0;
    if (current > floor) {
      return true;
    }
    if (current < floor) {
      return false;
    }
  }
  return true;
}

export function resetInstallPrompt(context: vscode.ExtensionContext): Thenable<void> {
  return context.globalState.update(INSTALL_PROMPT_KEY, false);
}
