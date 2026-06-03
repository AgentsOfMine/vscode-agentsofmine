import * as vscode from 'vscode';
import * as cp from 'child_process';
import { detectCollector } from './detector.js';

export interface SyncResult {
  synced: number;
  failed: number;
  errors: string[];
}

export class CollectorRunner {
  private statusBarItem: vscode.StatusBarItem;
  private terminal: vscode.Terminal | null = null;
  private terminalCloseDisposable: vscode.Disposable | null = null;
  private revertStatusBarTimer: ReturnType<typeof setTimeout> | null = null;
  lastSyncResult: SyncResult | null = null;

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

  async syncNow(): Promise<SyncResult> {
    return new Promise((resolve, reject) => {
      cp.exec('aom sync', (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        try {
          const result = JSON.parse(stdout.trim()) as SyncResult;
          this.lastSyncResult = result;
          this.onSyncSuccess();
          resolve(result);
        } catch (parseError) {
          reject(parseError);
        }
      });
    });
  }

  private onSyncSuccess(): void {
    if (this.revertStatusBarTimer !== null) {
      clearTimeout(this.revertStatusBarTimer);
    }
    this.statusBarItem.text = '$(check) AOM';
    this.statusBarItem.tooltip = 'Last synced just now';
    this.statusBarItem.show();

    this.revertStatusBarTimer = setTimeout(() => {
      this.revertStatusBarTimer = null;
      if (this.isRunning) {
        this.updateStatusBar('running');
      }
    }, 60_000);
  }

  stop(): void {
    this.terminal?.sendText('', true);
    this.terminal?.dispose();
    this.terminal = null;
    this.terminalCloseDisposable?.dispose();
    this.terminalCloseDisposable = null;
    if (this.revertStatusBarTimer !== null) {
      clearTimeout(this.revertStatusBarTimer);
      this.revertStatusBarTimer = null;
    }
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
