import * as vscode from 'vscode';

/**
 * Called once when the extension is first activated.
 * Activation is deferred until any `agentsofmine.*` command is invoked.
 */
export function activate(context: vscode.ExtensionContext): void {
  const hello = vscode.commands.registerCommand('agentsofmine.hello', () => {
    void vscode.window.showInformationMessage('AgentsOfMine is here.');
  });

  context.subscriptions.push(hello);
}

/**
 * Called when the extension is deactivated (VS Code shutdown or explicit disable).
 */
export function deactivate(): void {
  // nothing to clean up yet
}
