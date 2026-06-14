import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { detectCollector } from './detector.js';

export interface SyncResult {
  synced: number;
  failed: number;
  errors: string[];
}

type State = 'signed-out' | 'idle' | 'pairing' | 'syncing' | 'synced' | 'error';

export class CollectorRunner {
  private statusBarItem: vscode.StatusBarItem;
  private currentState: State = 'signed-out';
  private syncTimeoutHandle: ReturnType<typeof setTimeout> | null = null;
  private syncInFlight = false;
  private lastSyncError: string | null = null;

  lastSyncResult: SyncResult | null = null;

  constructor(private context: vscode.ExtensionContext) {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      -1000,
    );
    this.updateState('signed-out');
    this.statusBarItem.show();
  }

  async start(): Promise<void> {
    const detection = await detectCollector();
    if (!detection.found) {
      return;
    }

    await this.initializeState();
  }

  private async initializeState(): Promise<void> {
    const isPaired = await this.isPaired();
    this.updateState(isPaired ? 'idle' : 'signed-out');
  }

  // Interim: paired detection uses SecretStorage + last-sync.json presence.
  // Replace with `aom status --json` once the collector ships that flag.
  private async isPaired(): Promise<boolean> {
    const token = await this.context.secrets.get('agentsofmine.deviceToken');
    if (token) {
      return true;
    }

    const lastSyncPath = this.getLastSyncPath();
    try {
      const stats = fs.statSync(lastSyncPath);
      return stats.isFile();
    } catch {
      return false;
    }
  }

  private getLastSyncPath(): string {
    return path.join(this.getConfigDir(), 'last-sync.json');
  }

  private getConfigDir(): string {
    const home = process.env.HOME || process.env.USERPROFILE || '';
    return path.join(home, '.agentsofmine');
  }

  private getLastSyncTimestamp(): string {
    try {
      const lastSyncPath = this.getLastSyncPath();
      const content = fs.readFileSync(lastSyncPath, 'utf-8');
      const data = JSON.parse(content) as Record<string, string>;
      const timestamps = Object.values(data).filter((v) => typeof v === 'string');
      if (timestamps.length === 0) {
        return 'never';
      }
      const newest = new Date(Math.max(...timestamps.map((t) => new Date(t).getTime())));
      return this.formatRelativeTime(newest);
    } catch {
      return 'never';
    }
  }

  private formatRelativeTime(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) {
      return 'just now';
    }
    if (diffMins < 60) {
      return `${diffMins}m ago`;
    }
    if (diffHours < 24) {
      return `${diffHours}h ago`;
    }
    return `${diffDays}d ago`;
  }

  private lastErrorIsAuth = false;

  private isLastErrorAuth(): boolean {
    return this.lastErrorIsAuth;
  }

  private isAuthError(error: Error): boolean {
    const message = error.message.toLowerCase();
    const stack = (error.stack || '').toLowerCase();
    return /401|unauthorized|forbidden/.test(message) || /401|unauthorized|forbidden/.test(stack);
  }

  async syncNow(): Promise<SyncResult> {
    return new Promise((resolve, reject) => {
      this.syncInFlight = true;
      this.updateState('syncing');

      cp.exec('aom sync', { maxBuffer: 10 * 1024 * 1024 }, (error, stdout) => {
        this.syncInFlight = false;

        if (error) {
          this.lastSyncError = error.message;
          this.lastErrorIsAuth = this.isAuthError(error);
          this.updateState('error');
          reject(error);
          return;
        }

        try {
          const result = JSON.parse(stdout.trim()) as SyncResult;
          this.lastSyncResult = result;
          this.lastSyncError = null;
          this.updateState('synced');

          if (this.syncTimeoutHandle !== null) {
            clearTimeout(this.syncTimeoutHandle);
          }
          this.syncTimeoutHandle = setTimeout(() => {
            this.syncTimeoutHandle = null;
            if (this.currentState === 'synced') {
              this.updateState('idle');
            }
          }, 60_000);

          resolve(result);
        } catch (parseError) {
          this.lastSyncError = parseError instanceof Error ? parseError.message : 'Parse error';
          this.updateState('idle');
          reject(parseError);
        }
      });
    });
  }

  stop(): void {
    if (this.syncTimeoutHandle !== null) {
      clearTimeout(this.syncTimeoutHandle);
      this.syncTimeoutHandle = null;
    }
  }

  get isRunning(): boolean {
    return this.syncInFlight;
  }

  async refresh(): Promise<void> {
    await this.initializeState();
  }

  setPairing(active: boolean): void {
    if (active) {
      this.updateState('pairing');
    } else {
      void this.initializeState();
    }
  }

  dispose(): void {
    this.stop();
    this.statusBarItem.dispose();
  }

  private updateState(state: State): void {
    this.currentState = state;

    switch (state) {
      case 'signed-out':
        this.statusBarItem.text = '$(account) AgentsOfMine.io';
        this.statusBarItem.color = undefined;
        this.statusBarItem.backgroundColor = undefined;
        this.statusBarItem.command = 'agentsofmine.signIn';
        break;

      case 'idle':
        this.statusBarItem.text = '$(cloud) AgentsOfMine.io';
        this.statusBarItem.color = undefined;
        this.statusBarItem.backgroundColor = undefined;
        this.statusBarItem.command = 'agentsofmine.openSyncMenu';
        break;

      case 'pairing':
        this.statusBarItem.text = '$(device-mobile) Awaiting phone approval…';
        this.statusBarItem.color = new vscode.ThemeColor('statusBarItem.prominentForeground');
        this.statusBarItem.backgroundColor = undefined;
        this.statusBarItem.command = undefined;
        break;

      case 'syncing':
        this.statusBarItem.text = '$(sync~spin) Syncing with AgentsOfMine.io';
        this.statusBarItem.color = new vscode.ThemeColor('statusBarItem.prominentForeground');
        this.statusBarItem.backgroundColor = undefined;
        this.statusBarItem.command = 'agentsofmine.openSyncMenu';
        break;

      case 'synced':
        this.statusBarItem.text = '$(check) AgentsOfMine.io';
        this.statusBarItem.color = undefined;
        this.statusBarItem.backgroundColor = undefined;
        this.statusBarItem.command = 'agentsofmine.openSyncMenu';
        break;

      case 'error':
        this.statusBarItem.text = '$(warning) AgentsOfMine.io';
        this.statusBarItem.color = new vscode.ThemeColor('statusBarItem.errorForeground');
        this.statusBarItem.backgroundColor = this.isLastErrorAuth()
          ? new vscode.ThemeColor('statusBarItem.errorBackground')
          : undefined;
        this.statusBarItem.command = 'agentsofmine.openSyncMenu';
        break;
    }
  }

  getCurrentState(): State {
    return this.currentState;
  }

  getLastSyncErrorMessage(): string | null {
    return this.lastSyncError;
  }

  buildSyncMenuItems(): vscode.QuickPickItem[] {
    const items: vscode.QuickPickItem[] = [];

    // Header with last sync time
    items.push({
      label: `Last sync: ${this.getLastSyncTimestamp()}`,
      kind: vscode.QuickPickItemKind.Separator,
    });

    // Retry now (only on error)
    if (this.currentState === 'error') {
      items.push({
        label: 'Retry now',
        description: 'Try syncing again',
      });
    }

    // Visit account
    items.push({
      label: 'Visit your account',
      description: 'app.agentsofmine.io',
    });

    // Help
    items.push({
      label: 'Help',
      description: 'agentsofmine.io',
    });

    return items;
  }
}
