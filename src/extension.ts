import * as vscode from 'vscode';
import { ensureCollectorInstalled, resetInstallPrompt } from './collector/installer.js';
import { CollectorRunner } from './collector/runner.js';

let runner: CollectorRunner | null = null;

export function activate(context: vscode.ExtensionContext): void {
  runner = new CollectorRunner();

  const startCollector = vscode.commands.registerCommand(
    'agentsofmine.startCollector',
    () => runner?.start(),
  );

  const installCollector = vscode.commands.registerCommand(
    'agentsofmine.installCollector',
    () => ensureCollectorInstalled(context),
  );

  const openStatus = vscode.commands.registerCommand(
    'agentsofmine.openStatus',
    () => vscode.commands.executeCommand('workbench.action.terminal.focus'),
  );

  const resetPrompt = vscode.commands.registerCommand(
    'agentsofmine.resetInstallPrompt',
    () => resetInstallPrompt(context),
  );

  const syncNow = vscode.commands.registerCommand('agentsofmine.syncNow', () => {
    void runner?.syncNow();
  });

  context.subscriptions.push(startCollector, installCollector, openStatus, resetPrompt, syncNow, {
    dispose: () => runner?.dispose(),
  });

  void ensureCollectorInstalled(context).then((decision) => {
    if (decision === 'already-present' || decision === 'install') {
      void runner?.start();
    }
  });
}

export function deactivate(): void {
  runner?.stop();
}
