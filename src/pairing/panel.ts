import { randomUUID, randomBytes } from 'node:crypto';
import { hostname } from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';

const API_BASE = 'https://agentsofmine.io';
const DEVICE_ID_KEY = 'agentsofmine.deviceId';
const DEVICE_TOKEN_KEY = 'agentsofmine.deviceToken';
const FETCH_TIMEOUT_MS = 10_000;

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

interface QrCode {
  addData(data: string): void;
  make(): void;
  createDataURL(cellSize?: number, margin?: number): string;
}
type QrFactory = (typeNumber: number, ecl: string) => QrCode;

type ApprovedCallback = (token: string) => Promise<void> | void;

function loadQrFactory(extensionPath: string): QrFactory | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(path.join(extensionPath, 'assets', 'qrcode.js')) as QrFactory;
  } catch {
    return null;
  }
}

function qrDataUri(qrUrl: string, extensionPath: string): string | null {
  const factory = loadQrFactory(extensionPath);
  if (!factory) {
    return null;
  }
  try {
    const qr = factory(0, 'M');
    qr.addData(qrUrl);
    qr.make();
    return qr.createDataURL(6, 16);
  } catch {
    return null;
  }
}

export class PairingPanel {
  private static current: PairingPanel | null = null;

  private panel: vscode.WebviewPanel | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private deviceId = '';
  private qrUrl = '';
  private approved = false;

  private constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly onApproved: ApprovedCallback,
    private readonly onClosedWithoutApproval: () => void,
  ) {}

  static async open(
    context: vscode.ExtensionContext,
    onApproved: ApprovedCallback,
    onClosedWithoutApproval: () => void,
  ): Promise<void> {
    if (PairingPanel.current?.panel) {
      PairingPanel.current.panel.reveal(vscode.ViewColumn.Active);
      return;
    }
    const instance = new PairingPanel(context, onApproved, onClosedWithoutApproval);
    PairingPanel.current = instance;
    await instance.start();
  }

  private async start(): Promise<void> {
    this.deviceId = await this.getOrCreateDeviceId();

    this.panel = vscode.window.createWebviewPanel(
      'agentsofmine.pairing',
      'Pair this device',
      vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true },
    );

    this.panel.webview.onDidReceiveMessage((message: { command?: string }) => {
      this.handleMessage(message);
    });

    this.panel.onDidDispose(() => {
      this.stopPolling();
      const wasApproved = this.approved;
      if (PairingPanel.current === this) {
        PairingPanel.current = null;
      }
      this.panel = null;
      if (!wasApproved) {
        this.onClosedWithoutApproval();
      }
    });

    await this.initPairing();
  }

  private async getOrCreateDeviceId(): Promise<string> {
    const existing = this.context.globalState.get<string>(DEVICE_ID_KEY);
    if (existing) {
      return existing;
    }
    const fresh = randomUUID();
    await this.context.globalState.update(DEVICE_ID_KEY, fresh);
    return fresh;
  }

  private async initPairing(): Promise<void> {
    this.stopPolling();
    try {
      const init = await this.postInit();
      this.qrUrl = init.qrUrl;
      this.renderPairing(init);
      this.startPolling(Math.max(1, init.pollInterval));
    } catch {
      this.renderError("Couldn't reach AgentsOfMine. Check your connection and try again.");
    }
  }

  private async postInit(): Promise<PairInitResponse> {
    const userAgent = `VS Code ${vscode.version} / ${process.platform} / ${hostname()}`;
    const res = await this.timedFetch(`${API_BASE}/pair/init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: this.deviceId, userAgent }),
    });
    if (!res.ok) {
      throw new Error(`pair/init ${res.status}`);
    }
    return (await res.json()) as PairInitResponse;
  }

  private async getStatus(): Promise<PairStatusResponse> {
    const url = `${API_BASE}/pair/status?device=${encodeURIComponent(this.deviceId)}`;
    const res = await this.timedFetch(url, { method: 'GET' });
    if (!res.ok) {
      throw new Error(`pair/status ${res.status}`);
    }
    return (await res.json()) as PairStatusResponse;
  }

  private async timedFetch(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  private startPolling(intervalSeconds: number): void {
    this.pollTimer = setInterval(() => {
      void this.pollOnce();
    }, intervalSeconds * 1000);
  }

  private stopPolling(): void {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private async pollOnce(): Promise<void> {
    let status: PairStatusResponse;
    try {
      status = await this.getStatus();
    } catch {
      return;
    }

    if (status.status === 'approved' && status.deviceToken) {
      this.stopPolling();
      this.approved = true;
      await this.context.secrets.store(DEVICE_TOKEN_KEY, status.deviceToken);
      await this.onApproved(status.deviceToken);
      this.panel?.dispose();
    } else if (status.status === 'denied') {
      this.stopPolling();
      this.postState('error', 'Pairing was denied on your phone. Generate a new code.');
    } else if (status.status === 'expired') {
      this.stopPolling();
      this.postState('error', 'This pairing code expired. Generate a new one.');
    }
  }

  private handleMessage(message: { command?: string }): void {
    switch (message.command) {
      case 'copy':
        void vscode.env.clipboard.writeText(this.qrUrl);
        this.postState('copied');
        break;
      case 'cancel':
        this.panel?.dispose();
        break;
      case 'retry':
        void this.initPairing();
        break;
    }
  }

  private postState(kind: string, message?: string): void {
    this.panel?.webview.postMessage({ kind, message });
  }

  private renderPairing(init: PairInitResponse): void {
    if (!this.panel) {
      return;
    }
    const nonce = randomBytes(16).toString('base64');
    const code = init.pairingCode;
    const hyphenated = code.length >= 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
    const dataUri = qrDataUri(this.qrUrl, this.context.extensionPath);
    this.panel.webview.html = pairingHtml({
      nonce,
      cspSource: this.panel.webview.cspSource,
      hyphenatedCode: esc(hyphenated),
      qrDataUri: dataUri,
      qrUrl: this.qrUrl,
      expiresAtMs: init.expiresAt * 1000,
    });
  }

  private renderError(text: string): void {
    if (!this.panel) {
      return;
    }
    const nonce = randomBytes(16).toString('base64');
    this.panel.webview.html = errorHtml({
      nonce,
      cspSource: this.panel.webview.cspSource,
      message: esc(text),
    });
  }
}

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

interface PairingHtmlOptions {
  nonce: string;
  cspSource: string;
  hyphenatedCode: string;
  qrDataUri: string | null;
  qrUrl: string;
  expiresAtMs: number;
}

function pairingHtml(o: PairingHtmlOptions): string {
  const config = JSON.stringify({ expiresAtMs: o.expiresAtMs });
  const csp = [
    "default-src 'none'",
    `img-src ${o.cspSource} data:`,
    `style-src 'unsafe-inline' ${o.cspSource}`,
    `script-src 'nonce-${o.nonce}'`,
  ].join('; ');

  const qrCard = o.qrDataUri
    ? `<img class="qr-img" src="${o.qrDataUri}" alt="Pairing QR code" />`
    : `<div class="qr-fallback"><div>Open this URL on your phone:</div><div class="qr-fallback__url">${esc(o.qrUrl)}</div></div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<title>Pair this device</title>
<style>${PAIRING_CSS}</style>
</head>
<body>
<div class="modal" role="dialog" aria-label="Pair this device with AgentsOfMine">
  <div class="modal__header"><span class="modal__title">Pair this device with AgentsOfMine</span></div>
  <div id="error" class="error" role="alert"></div>
  <div id="content" class="modal__body">
    <div class="qr-card">${qrCard}</div>
    <div class="pair-info">
      <p class="pair-info__lead">Scan with your phone, then sign in and approve.</p>
      <div>
        <p class="pair-info__code-label">The code on your phone must match this exactly:</p>
        <span class="pair-code">${o.hyphenatedCode}</span>
      </div>
      <div class="pair-info__expires">Expires in <span class="countdown" id="countdown">--:--</span></div>
    </div>
  </div>
  <div class="modal__footer">
    <span id="copied" class="copied">Copied</span>
    <button class="btn btn--primary" id="copyBtn" type="button">Copy pairing URL</button>
    <button class="btn" id="cancelBtn" type="button">Cancel</button>
    <button class="btn btn--primary" id="retryBtn" type="button" style="display:none">Try again</button>
  </div>
</div>
<script nonce="${o.nonce}">
(function () {
  const vscode = acquireVsCodeApi();
  const cfg = ${config};
  const countdownEl = document.getElementById('countdown');
  let timer = setInterval(tick, 1000);
  tick();
  function tick() {
    const ms = Math.max(0, cfg.expiresAtMs - Date.now());
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    countdownEl.textContent = m + ':' + String(s).padStart(2, '0');
    if (ms <= 0) { clearInterval(timer); }
  }
  document.getElementById('copyBtn').addEventListener('click', function () {
    vscode.postMessage({ command: 'copy' });
  });
  document.getElementById('cancelBtn').addEventListener('click', function () {
    vscode.postMessage({ command: 'cancel' });
  });
  document.getElementById('retryBtn').addEventListener('click', function () {
    vscode.postMessage({ command: 'retry' });
  });
  window.addEventListener('message', function (event) {
    const data = event.data || {};
    if (data.kind === 'copied') {
      const c = document.getElementById('copied');
      c.classList.add('show');
      setTimeout(function () { c.classList.remove('show'); }, 1500);
      return;
    }
    if (data.kind === 'error') {
      if (timer) { clearInterval(timer); }
      const err = document.getElementById('error');
      err.textContent = data.message || 'Pairing failed.';
      err.classList.add('show');
      document.getElementById('content').style.display = 'none';
      document.getElementById('copyBtn').style.display = 'none';
      document.getElementById('cancelBtn').style.display = 'none';
      document.getElementById('retryBtn').style.display = 'inline-flex';
    }
  });
})();
</script>
</body>
</html>`;
}

function errorHtml(o: { nonce: string; cspSource: string; message: string }): string {
  const csp = [
    "default-src 'none'",
    `style-src 'unsafe-inline' ${o.cspSource}`,
    `script-src 'nonce-${o.nonce}'`,
  ].join('; ');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<title>Pair this device</title>
<style>${PAIRING_CSS}</style>
</head>
<body>
<div class="modal" role="dialog">
  <div class="modal__header"><span class="modal__title">Pair this device with AgentsOfMine</span></div>
  <div class="error show" role="alert">${o.message}</div>
  <div class="modal__footer">
    <button class="btn btn--primary" id="retryBtn" type="button">Try again</button>
  </div>
</div>
<script nonce="${o.nonce}">
(function () {
  const vscode = acquireVsCodeApi();
  document.getElementById('retryBtn').addEventListener('click', function () {
    vscode.postMessage({ command: 'retry' });
  });
})();
</script>
</body>
</html>`;
}

const PAIRING_CSS = `
:root {
  --bg-canvas:#0B0F14; --bg-card:#11161D; --bg-elevated:#161C25;
  --border:#1F2630; --border-strong:#2A3340;
  --neutral-400:#A3A9B2; --neutral-500:#8B929C;
  --text-primary:#F5F7FA; --text-muted:#C7CCD3;
  --brand-blue-500:#0A65F2; --danger:#FCA5A5;
}
* { box-sizing:border-box; }
html,body { margin:0; padding:0; }
body {
  background:var(--bg-canvas); color:var(--text-primary);
  font-family:system-ui,-apple-system,"Segoe UI",sans-serif;
  display:flex; align-items:center; justify-content:center;
  min-height:100vh; padding:24px;
}
.modal {
  width:100%; max-width:600px; background:var(--bg-elevated);
  border:1px solid var(--border-strong); border-radius:10px; overflow:hidden;
}
.modal__header { padding:16px 24px; border-bottom:1px solid var(--border); }
.modal__title { font-size:15px; font-weight:600; }
.modal__body { padding:28px; display:grid; grid-template-columns:200px 1fr; gap:28px; align-items:start; }
.qr-card { width:200px; height:200px; background:#FFF; border-radius:8px; padding:10px; display:flex; align-items:center; justify-content:center; }
.qr-img { width:100%; height:100%; object-fit:contain; image-rendering:pixelated; }
.qr-fallback { display:flex; flex-direction:column; gap:8px; align-items:center; justify-content:center; padding:8px; text-align:center; font-size:11px; color:#444; }
.qr-fallback__url { word-break:break-all; font-family:ui-monospace,monospace; color:#0A65F2; }
.pair-info { display:flex; flex-direction:column; gap:16px; }
.pair-info__lead { margin:0; font-size:13px; line-height:20px; color:var(--text-muted); }
.pair-info__code-label { margin:0 0 8px; font-size:11px; letter-spacing:.06em; text-transform:uppercase; color:var(--neutral-500); }
.pair-code { display:inline-block; font-family:ui-monospace,"SF Mono",monospace; font-size:22px; font-weight:600; letter-spacing:.18em; background:var(--bg-canvas); border:1px solid var(--border-strong); border-radius:6px; padding:8px 14px; }
.pair-info__expires { font-size:12px; color:var(--neutral-400); }
.countdown { font-family:ui-monospace,monospace; color:var(--text-muted); }
.modal__footer { display:flex; align-items:center; justify-content:flex-end; gap:10px; padding:16px 24px; background:var(--bg-card); border-top:1px solid var(--border); }
.btn { font-family:inherit; font-size:13px; padding:8px 14px; border-radius:6px; border:1px solid var(--border-strong); background:transparent; color:var(--text-muted); cursor:pointer; }
.btn--primary { background:var(--brand-blue-500); border-color:var(--brand-blue-500); color:#FFF; }
.copied { font-size:12px; color:var(--neutral-400); opacity:0; transition:opacity .15s; margin-right:auto; }
.copied.show { opacity:1; }
.error { display:none; margin:0 24px; padding:12px 16px; background:rgba(220,38,38,.1); border:1px solid rgba(220,38,38,.3); border-radius:6px; color:var(--danger); font-size:13px; }
.error.show { display:block; }
`;
