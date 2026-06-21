# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.0.1] — 2026-06-21

First pre-release. Pairs VS Code with your AgentsOfMine account and keeps your
AI coding sessions syncing in the background.

### Added
- **Sync status bar** — a single right-aligned indicator with six states
  (signed-out, idle, pairing, syncing, synced, error). Greyed out when idle,
  animated while syncing; always visible once active. Click it for a sync menu
  (last sync time, visit your account, help).
- **Native pairing** — a webview panel with a scannable QR code, the 8-character
  pairing code, and a live countdown. Scan with your phone, sign in once, approve.
  The device token is stored in VS Code's `SecretStorage`.
- **Silent collector provisioning** — installing the extension installs and
  manages the open-source [`agentsofmine-collector`](https://github.com/AgentsOfMine/collector)
  in the background (with a visible-terminal fallback if Node/npm aren't on PATH).
- **Getting Started walkthrough** — a Welcome-page tile that guides first-time
  pairing.
- Live sync state read from `aom status --json`, with a back-compat fallback for
  older collector versions.

### Supported agents
- Claude Code, OpenCode, Codex, and Pi (via the collector's adapters).

### Notes
- macOS and Linux only; Windows is not yet supported.
- Read-only by design: the extension never controls your agents, sends prompts,
  or signs into your AI provider accounts.
