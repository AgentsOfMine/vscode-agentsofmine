import * as vscode from 'vscode';
import { detectCollector } from './detector.js';

const INSTALL_PROMPT_KEY = 'agentsofmine.collectorInstallPrompted';
const PACKAGE_NAME = 'agentsofmine-collector';

export type InstallDecision = 'install' | 'skip' | 'already-present';

export async function ensureCollectorInstalled(
  context: vscode.ExtensionContext,
): Promise<InstallDecision> {
  const detection = await detectCollector();

  if (detection.found) {
    return 'already-present';
  }

  const alreadyPrompted = context.globalState.get<boolean>(INSTALL_PROMPT_KEY, false);
  if (alreadyPrompted) {
    return 'skip';
  }

  const choice = await vscode.window.showInformationMessage(
    'AgentsOfMine Collector not found. Install it now to start syncing sessions?',
    { modal: false },
    'Install',
    'Not now',
  );

  await context.globalState.update(INSTALL_PROMPT_KEY, true);

  if (choice !== 'Install') {
    return 'skip';
  }

  await installCollectorInVisibleTerminal();
  return 'install';
}

function installCollectorInVisibleTerminal(): Promise<void> {
  return new Promise((resolve) => {
    const terminal = vscode.window.createTerminal({
      name: 'AgentsOfMine — Install Collector',
      message: `Installing ${PACKAGE_NAME} globally…`,
    });

    terminal.show(true);
    terminal.sendText(`npm install -g ${PACKAGE_NAME} && aom pair`, false);

    const disposable = vscode.window.onDidCloseTerminal((closed) => {
      if (closed === terminal) {
        disposable.dispose();
        resolve();
      }
    });
  });
}

export function resetInstallPrompt(context: vscode.ExtensionContext): Thenable<void> {
  return context.globalState.update(INSTALL_PROMPT_KEY, false);
}
