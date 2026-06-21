import * as vscode from 'vscode';
import { ensureCollectorInstalled, resetInstallPrompt } from './collector/installer.js';
import { CollectorRunner } from './collector/runner.js';
import { PairingPanel } from './pairing/panel.js';

let runner: CollectorRunner | null = null;

const SIGNED_IN_TOAST =
  'AgentsOfMine is signed in. Sessions will sync as you work. ' +
  'Open the sync menu in the status bar to see progress.';

async function openPairing(context: vscode.ExtensionContext): Promise<void> {
  const detection = await ensureCollectorInstalled(context);
  if (detection === 'unsupported') {
    return;
  }
  runner?.setPairing(true);
  await PairingPanel.open(
    context,
    async (_token) => {
      await runner?.refresh();
      void vscode.window.showInformationMessage(SIGNED_IN_TOAST);
    },
    () => runner?.setPairing(false),
  );
}

export function activate(context: vscode.ExtensionContext): void {
  runner = new CollectorRunner(context);

  const startCollector = vscode.commands.registerCommand(
    'agentsofmine.startCollector',
    () => runner?.start(),
  );

  const installCollector = vscode.commands.registerCommand(
    'agentsofmine.installCollector',
    () => ensureCollectorInstalled(context),
  );

  const signIn = vscode.commands.registerCommand(
    'agentsofmine.signIn',
    () => openPairing(context),
  );

  const pairDevice = vscode.commands.registerCommand(
    'agentsofmine.pairDevice',
    () => openPairing(context),
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

  const openSyncMenu = vscode.commands.registerCommand('agentsofmine.openSyncMenu', async () => {
    if (!runner) {
      return;
    }

    const items = runner.buildSyncMenuItems();
    const pick = await vscode.window.createQuickPick();
    pick.title = 'AgentsOfMine';
    pick.items = items;
    pick.canSelectMany = false;

    const selection = await new Promise<vscode.QuickPickItem | undefined>((resolve) => {
      pick.onDidAccept(() => {
        const selected = pick.selectedItems[0];
        resolve(selected);
        pick.hide();
      });

      pick.onDidHide(() => {
        resolve(undefined);
        pick.dispose();
      });

      pick.show();
    });

    if (!selection) {
      return;
    }

    if (selection.label === 'Retry now') {
      void runner.syncNow();
    } else if (selection.label === 'Visit your account') {
      await vscode.env.openExternal(vscode.Uri.parse('https://app.agentsofmine.io'));
    } else if (selection.label === 'Help') {
      await vscode.env.openExternal(vscode.Uri.parse('https://agentsofmine.io'));
    }
  });

  context.subscriptions.push(
    startCollector,
    installCollector,
    signIn,
    pairDevice,
    openStatus,
    resetPrompt,
    syncNow,
    openSyncMenu,
    {
      dispose: () => runner?.dispose(),
    },
  );

  void ensureCollectorInstalled(context).then((decision) => {
    if (decision === 'unsupported' || decision === 'skip') {
      return;
    }
    void runner?.start();
  });
}

export function deactivate(): void {
  runner?.stop();
}
