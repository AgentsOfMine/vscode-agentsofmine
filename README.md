# AgentsOfMine for VS Code

The official [AgentsOfMine](https://agentsofmine.io) extension for Visual Studio Code.

AgentsOfMine turns your AI coding agent sessions — Claude Code, OpenCode, Codex, Pi — into a searchable development memory you can revisit on mobile. It is **read-only by design**: it never controls your agents, never sends prompts, and never signs into your AI provider accounts.

## Installing this extension is all you need

Installing this extension is the only thing you do. It automatically installs and manages the open-source **[AgentsOfMine collector](https://github.com/AgentsOfMine/collector)** — the local engine that reads your agent sessions — so you never touch a CLI.

> Prefer the terminal, or use another editor (Claude Code CLI, OpenCode, Cursor, Zed)? Install the [collector](https://github.com/AgentsOfMine/collector) directly instead — you don't need both.

## What you'll see

A live sync indicator in the bottom-right of VS Code, right next to your other AI assistants — greyed out when idle, animated when syncing. Click it for a quick sync menu: last sync time, a link to your account, and help.

## Getting started

1. **Install** this extension.
2. **Pair** — click the status-bar item (or run *AgentsOfMine: Pair this device*) to open a panel with a QR code. Scan it with your phone, sign in once, and approve.
3. **Done** — sessions sync as you work.

The device token is stored in VS Code's [`SecretStorage`](https://code.visualstudio.com/api/references/vscode-api#SecretStorage) — never on disk in plaintext.

## Privacy

- **Read-only.** We observe your AI agents; we never send prompts, run commands, or control them.
- **You choose which projects sync.**
- **Encrypted in transit and at rest.**
- **Export anytime, delete anytime.**

## How it relates to the collector

**The extension is the front door. The collector is the engine room.**

- VS Code users install **only this extension**. It provisions and manages the collector for you.
- Users of other editors or terminals install **the collector** directly.

Same engine, two doors. Nobody needs both.

> **Why are there two repositories?** The collector is editor-agnostic and open-source so it works with any agent on any editor or terminal, and so you can read every line that runs on your machine. The VS Code extension is a thin, friendly wrapper that installs the collector, handles pairing with a QR code, and shows sync status in your status bar. VS Code users install the extension; everyone else installs the collector.

## Requirements

- **Node.js ≥ 20** and **npm** on your PATH (the extension uses them to install the collector).
- **macOS or Linux.** Windows is not supported yet — see the [collector requirements](https://github.com/AgentsOfMine/collector#requirements).

## Status

Pre-release. Not yet on the VS Code Marketplace.

## License

MIT — see [LICENSE](./LICENSE). The AgentsOfMine name and brand mark are reserved and are not covered by the MIT license.

## Links

- Website: https://agentsofmine.io
- Collector (engine): https://github.com/AgentsOfMine/collector
- Issues: [GitHub Issues](https://github.com/AgentsOfMine/vscode-agentsofmine/issues)
- Security: [SECURITY.md](./SECURITY.md)
