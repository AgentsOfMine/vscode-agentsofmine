import * as vscode from 'vscode';
import { randomUUID } from 'node:crypto';

interface PairInitResponse {
  pairingCode: string;
  expiresAt: number;
  pollInterval: number;
  qrUrl: string;
}

interface PairStatusResponse {
  status: 'pending' | 'approved' | 'denied' | 'expired';
  deviceToken?: string;
}

export class PairingPanel {
  private static instance: PairingPanel | null = null;
  private webviewPanel: vscode.WebviewPanel | null = null;
  private pollTimerId: ReturnType<typeof setInterval> | null = null;

  constructor(
    private context: vscode.ExtensionContext,
    private onApproved: (token: string) => Promise<void>,
  ) {}

  static async open(
    context: vscode.ExtensionContext,
    onApproved: (token: string) => Promise<void>,
  ): Promise<void> {
    if (PairingPanel.instance) {
      PairingPanel.instance.webviewPanel?.reveal();
      return;
    }
    const panel = new PairingPanel(context, onApproved);
    await panel.show();
  }

  private async show(): Promise<void> {
    const deviceId = await this.getOrCreateDeviceId();
    const pairInit = await this.initPairing(deviceId);
    this.createWebviewPanel(deviceId, pairInit);
    this.startPolling(deviceId, pairInit.pollInterval);
  }

  private async getOrCreateDeviceId(): Promise<string> {
    let deviceId = this.context.globalState.get<string>('agentsofmine.deviceId');
    if (!deviceId) {
      deviceId = randomUUID();
      await this.context.globalState.update('agentsofmine.deviceId', deviceId);
    }
    return deviceId;
  }

  private async initPairing(deviceId: string): Promise<PairInitResponse> {
    const response = await this.fetch('POST', '/pair/init', {
      deviceId,
      userAgent: `VS Code ${vscode.version} / ${process.platform}`,
    });
    return response as PairInitResponse;
  }

  private async fetch(method: string, path: string, body?: unknown): Promise<unknown> {
    const url = new URL(path, 'https://agentsofmine.io');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const init: RequestInit = {
        method,
        signal: controller.signal,
      };
      if (body) {
        init.headers = { 'Content-Type': 'application/json' };
        init.body = JSON.stringify(body);
      }
      const response = await fetch(url.toString(), init);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  private createWebviewPanel(deviceId: string, pairInit: PairInitResponse): void {
    const nonce = this.generateNonce();
    this.webviewPanel = vscode.window.createWebviewPanel(
      'agentsofmine.pairing',
      'Pair this device',
      vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    PairingPanel.instance = this;
    this.webviewPanel.webview.html = this.getWebviewHtml(
      pairInit.pairingCode,
      pairInit.qrUrl,
      pairInit.expiresAt,
      nonce,
    );
    this.webviewPanel.webview.onDidReceiveMessage((message) => {
      this.handleWebviewMessage(message, pairInit.qrUrl);
    });
    this.webviewPanel.onDidDispose(() => {
      this.dispose();
    });
  }

  private getWebviewHtml(code: string, qrUrl: string, expiresAt: number, nonce: string): string {
    const hyphenatedCode = `${code.slice(0, 4)}-${code.slice(4)}`;
    const expiresAtMs = expiresAt * 1000;
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'" />
  <title>Pair this device</title>
  <style>
    :root {
      --bg-canvas: #0B0F14;
      --bg-elevated: #161C25;
      --bg-card: #11161D;
      --border: #1F2630;
      --border-strong: #2A3340;
      --text-primary: #F5F7FA;
      --text-muted: #C7CCD3;
      --neutral-400: #A3A9B2;
      --neutral-500: #8B929C;
      --brand-blue-500: #0A65F2;
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      background: var(--bg-canvas);
      color: var(--text-primary);
      font-family: system-ui, -apple-system, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 20px;
    }
    .modal {
      width: 100%;
      max-width: 580px;
      background: var(--bg-elevated);
      border: 1px solid var(--border-strong);
      border-radius: 10px;
      box-shadow: 0 24px 64px rgba(0,0,0,0.7);
    }
    .modal__header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 24px;
      border-bottom: 1px solid var(--border);
    }
    .modal__title {
      font-size: 15px;
      font-weight: 600;
      letter-spacing: -0.005em;
    }
    .modal__body {
      padding: 28px;
      display: grid;
      grid-template-columns: 200px 1fr;
      gap: 28px;
      align-items: start;
    }
    .qr-card {
      width: 200px;
      height: 200px;
      background: #FFFFFF;
      border-radius: 8px;
      padding: 12px;
      box-shadow: 0 6px 18px rgba(0,0,0,0.35);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .qr-card img { width: 100%; height: 100%; object-fit: contain; }
    .pair-info {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .pair-info__lead {
      font-size: 13px;
      line-height: 20px;
      color: var(--text-muted);
      margin: 0;
    }
    .pair-info__code-label {
      font-size: 11px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--neutral-500);
      margin: 0;
    }
    .pair-code {
      display: inline-block;
      font-family: monospace;
      font-size: 22px;
      font-weight: 600;
      letter-spacing: 0.18em;
      color: var(--text-primary);
      background: var(--bg-canvas);
      border: 1px solid var(--border-strong);
      border-radius: 6px;
      padding: 8px 14px;
    }
    .pair-info__expires {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      color: var(--neutral-400);
    }
    .countdown { font-family: monospace; color: var(--text-muted); }
    .modal__footer {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      padding: 16px 24px;
      background: var(--bg-card);
      border-top: 1px solid var(--border);
    }
    .btn {
      font-size: 13px;
      padding: 8px 14px;
      border-radius: 6px;
      border: 1px solid var(--border-strong);
      background: transparent;
      color: var(--text-muted);
      font-family: inherit;
      cursor: pointer;
    }
    .btn--primary {
      background: var(--brand-blue-500);
      border-color: var(--brand-blue-500);
      color: #FFFFFF;
    }
    .error {
      display: none;
      margin: 16px 24px 0;
      padding: 12px 16px;
      background: rgba(220, 38, 38, 0.1);
      border: 1px solid rgba(220, 38, 38, 0.3);
      border-radius: 6px;
      color: #FCA5A5;
      font-size: 13px;
    }
    .error.show { display: block; }
  </style>
</head>
<body>
  <div class="modal" role="dialog">
    <div class="modal__header">
      <span class="modal__title">Pair this device with AgentsOfMine</span>
    </div>
    <div id="error" class="error"></div>
    <div id="content" class="modal__body">
      <div class="qr-card">
        <img src="${qrUrl}" alt="QR Code" onerror="this.parentElement.innerHTML='<div style=\\"font-size:10px;color:#666;text-align:center;word-break:break-all;\\">Scan this URL:<br/>${qrUrl}</div>'" />
      </div>
      <div class="pair-info">
        <p class="pair-info__lead">Scan with your phone, then sign in and approve.</p>
        <div>
          <p class="pair-info__code-label">The code on your phone must match this exactly:</p>
          <span class="pair-code">${hyphenatedCode}</span>
        </div>
        <div class="pair-info__expires">
          <span>Expires in <span class="countdown" id="countdown">5:00</span></span>
        </div>
      </div>
    </div>
    <div class="modal__footer">
      <button class="btn btn--primary" id="copyBtn">Copy pairing URL</button>
      <button class="btn" id="cancelBtn">Cancel</button>
    </div>
  </div>
  <script nonce="${nonce}">
    const expiresAtMs = ${expiresAtMs};
    const qrUrl = '${qrUrl.replace(/'/g, "\\'")}';
    let countdownInterval;
    function updateCountdown() {
      const now = Date.now();
      const diffMs = Math.max(0, expiresAtMs - now);
      const mins = Math.floor(diffMs / 60000);
      const secs = Math.floor((diffMs % 60000) / 1000);
      document.getElementById('countdown').textContent = \`\${mins}:\${secs.toString().padStart(2, '0')}\`;
      if (diffMs <= 0) {
        clearInterval(countdownInterval);
        showError('This pairing code expired. Generate a new one.');
      }
    }
    function showError(msg) {
      const errorEl = document.getElementById('error');
      errorEl.textContent = msg;
      errorEl.classList.add('show');
      document.getElementById('content').style.display = 'none';
      document.getElementById('copyBtn').style.display = 'none';
      document.getElementById('cancelBtn').textContent = 'Try again';
      document.getElementById('cancelBtn').onclick = () => {
        const vscode = acquireVsCodeApi();
        vscode.postMessage({ command: 'retry' });
      };
    }
    document.getElementById('copyBtn').addEventListener('click', () => {
      const vscode = acquireVsCodeApi();
      vscode.postMessage({ command: 'copy', url: qrUrl });
    });
    document.getElementById('cancelBtn').addEventListener('click', () => {
      const vscode = acquireVsCodeApi();
      vscode.postMessage({ command: 'cancel' });
    });
    updateCountdown();
    countdownInterval = setInterval(updateCountdown, 1000);
  </script>
</body>
</html>`;
  }

  private generateNonce(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  private handleWebviewMessage(message: { command: string; url?: string }, qrUrl: string): void {
    if (message.command === 'copy') {
      void vscode.env.clipboard.writeText(qrUrl || message.url || '');
    } else if (message.command === 'cancel') {
      this.dispose();
    } else if (message.command === 'retry') {
      this.dispose();
      void PairingPanel.open(this.context, this.onApproved);
    }
  }

  private startPolling(deviceId: string, pollInterval: number): void {
    this.pollTimerId = setInterval(async () => {
      try {
        const response = await this.checkPairingStatus(deviceId);
        if (response.status === 'approved' && response.deviceToken) {
          await this.context.secrets.store('agentsofmine.deviceToken', response.deviceToken);
          await this.onApproved(response.deviceToken);
          this.dispose();
        } else if (response.status === 'denied' || response.status === 'expired') {
          const message =
            response.status === 'denied'
              ? 'Pairing was denied. Try again.'
              : 'This pairing code expired. Generate a new one.';
          this.webviewPanel?.webview.postMessage({ command: 'error', message });
        }
      } catch {
        // Network error - continue polling
      }
    }, pollInterval * 1000);
  }

  private async checkPairingStatus(deviceId: string): Promise<PairStatusResponse> {
    const response = await this.fetch('GET', `/pair/status?device=${deviceId}`);
    return response as PairStatusResponse;
  }

  dispose(): void {
    PairingPanel.instance = null;
    if (this.pollTimerId) {
      clearInterval(this.pollTimerId);
      this.pollTimerId = null;
    }
    this.webviewPanel?.dispose();
    this.webviewPanel = null;
  }
}
