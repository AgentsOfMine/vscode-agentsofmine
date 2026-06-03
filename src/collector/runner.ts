import * as vscode from 'vscode';
import { detectCollector } from './detector.js';

export class CollectorRunner {
  private statusBarItem: vscode.StatusBarItem;
  private terminal: vscode.Terminal | null = null;
  private terminalCloseDisposable: vscode.Disposable | null = null;

  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100,
    );
    this.statusBarItem.command = 'agentsofmine.openStatus';
    this.updateStatusBar('idle');
  }

  async start(): Promise<void> {
    const detection = await detectCollector();
    if (!detection.found) {
      this.updateStatusBar('not-installed');
      return;
    }

    if (this.terminal && !this.terminal.exitStatus) {
      return;
    }

    this.terminal = vscode.window.createTerminal({
      name: 'AgentsOfMine Collector',
      hideFromUser: true,
    });

    this.terminal.sendText('aom start', true);
    this.updateStatusBar('running');

    this.terminalCloseDisposable = vscode.window.onDidCloseTerminal((closed) => {
      if (closed === this.terminal) {
        this.terminal = null;
        this.updateStatusBar('stopped');
        this.terminalCloseDisposable?.dispose();
        this.terminalCloseDisposable = null;
      }
    });
  }

  stop(): void {
    this.terminal?.sendText('', true);
    this.terminal?.dispose();
    this.terminal = null;
    this.terminalCloseDisposable?.dispose();
    this.terminalCloseDisposable = null;
    this.updateStatusBar('idle');
  }

  get isRunning(): boolean {
    return this.terminal !== null && this.terminal.exitStatus === undefined;
  }

  dispose(): void {
    this.stop();
    this.statusBarItem.dispose();
  }

  private updateStatusBar(state: 'running' | 'stopped' | 'idle' | 'not-installed'): void {
    switch (state) {
      case 'running':
        this.statusBarItem.text = '$(sync~spin) AOM';
        this.statusBarItem.tooltip = 'AgentsOfMine Collector is syncing sessions';
        this.statusBarItem.backgroundColor = undefined;
        this.statusBarItem.show();
        break;
      case 'stopped':
        this.statusBarItem.text = '$(warning) AOM';
        this.statusBarItem.tooltip = 'AgentsOfMine Collector stopped unexpectedly. Click to restart.';
        this.statusBarItem.command = 'agentsofmine.startCollector';
        this.statusBarItem.show();
        break;
      case 'not-installed':
        this.statusBarItem.text = '$(cloud-download) AOM';
        this.statusBarItem.tooltip = 'AgentsOfMine Collector not installed. Click to install.';
        this.statusBarItem.command = 'agentsofmine.installCollector';
        this.statusBarItem.show();
        break;
      case 'idle':
        this.statusBarItem.hide();
        break;
    }
  }
}
