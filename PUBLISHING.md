# Publishing to the VS Code Marketplace

This runbook covers releasing `agentsofmine.vscode-agentsofmine` to the
[Visual Studio Marketplace](https://marketplace.visualstudio.com/). It is a
manual, human-gated process: it requires an Azure DevOps Personal Access Token
(PAT) that is **not** stored in this repo.

## Prerequisites (one-time)

1. **Azure DevOps organization** — the Marketplace publisher is backed by an
   Azure DevOps account. Create one at <https://dev.azure.com> if needed.

2. **Create the publisher** `agentsofmine` (must match `publisher` in
   `package.json`):
   - Go to <https://marketplace.visualstudio.com/manage/publishers/>
   - Create a publisher with ID `agentsofmine`, display name `AgentsOfMine`.

3. **Create a Personal Access Token** for publishing:
   - Azure DevOps → User settings → Personal Access Tokens → New Token
   - Organization: **All accessible organizations**
   - Scopes: **Marketplace → Manage**
   - Copy the token. Store it in 1Password ("AgentsOfMine Marketplace PAT").
   - **Never commit it.**

## Release checklist (every release)

1. Bump `version` in `package.json` (SemVer). Add a matching section to
   `CHANGELOG.md`.
2. Ensure the working tree is clean and `main` is pushed.
3. Run the full gate locally:
   ```bash
   pnpm install --frozen-lockfile
   pnpm lint && pnpm typecheck && pnpm compile
   xvfb-run -a pnpm test   # on Linux; plain `pnpm test` on macOS
   pnpm package            # produces the .vsix; sanity-check size/contents
   ```
4. Inspect the package contents:
   ```bash
   npx vsce ls --tree
   ```
   Confirm `assets/icon.png`, `assets/qrcode.js`, `assets/walkthrough-pair.png`,
   and `out/src/**` are present, and that `src/`, tests, and maps are NOT.

## Publish

Authenticate once per machine, then publish:

```bash
# Option A — interactive login (stores the PAT in the keychain via vsce)
npx vsce login agentsofmine
npx vsce publish --no-dependencies

# Option B — token inline (CI-friendly; do not echo the token)
npx vsce publish --no-dependencies --pat "$VSCE_PAT"
```

`--no-dependencies` matches our `package` script (pnpm layout; deps are bundled
into `out/`, nothing is installed at runtime except the vendored
`assets/qrcode.js`).

To publish a specific version bump in one step:
```bash
npx vsce publish patch --no-dependencies    # or: minor | major | <x.y.z>
```

## Verify after publish

- Listing: <https://marketplace.visualstudio.com/items?itemName=agentsofmine.vscode-agentsofmine>
- Install fresh and click through pairing on a clean machine:
  ```bash
  code --install-extension agentsofmine.vscode-agentsofmine
  ```
- Confirm the icon renders on the listing and in the Extensions sidebar.

## Optional: publish from CI

The PAT can be added as a GitHub Actions secret (`VSCE_PAT`) and a tag-triggered
job can run `vsce publish --no-dependencies --pat "$VSCE_PAT"`. Keep this on a
manual `workflow_dispatch` or tag filter — never publish on every push to
`main`. The existing CI already builds and uploads the `.vsix` artifact on every
push, which is the validation half; publishing stays a deliberate, gated step.

## Pre-1.0 reality check

Before the first public publish, do a real end-to-end pairing on a clean machine
(install → scan QR with a phone → approve → status bar flips to idle). The
backend contract, QR rendering, and webview are verified in tests, but the full
human hop has not yet been exercised on a fresh install.
