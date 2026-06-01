# Contributing to vscode-agentsofmine

Thanks for taking the time to contribute.

## Getting started

**Prerequisites**: Node 20+ and pnpm.

```bash
corepack enable
git clone https://github.com/kifahabbad/vscode-agentsofmine.git
cd vscode-agentsofmine
pnpm install
pnpm compile
```

Hit **F5** in VS Code to launch the extension host.

## Development workflow

```bash
pnpm watch       # incremental TypeScript compilation
pnpm lint        # ESLint
pnpm typecheck   # tsc --noEmit
pnpm test        # Mocha via @vscode/test-electron
```

All four must pass before opening a PR.

## Branch conventions

| Branch | Purpose |
|---|---|
| `main` | Stable, always releasable |
| `feat/<name>` | New features |
| `fix/<name>` | Bug fixes |
| `chore/<name>` | Tooling, deps, docs |

## Pull requests

- One logical change per PR.
- Include a short description of *why*, not just *what*.
- Add or update tests for any behaviour change.
- Run `pnpm lint && pnpm typecheck && pnpm test` locally first.

## Reporting bugs

Use [GitHub Issues](https://github.com/kifahabbad/vscode-agentsofmine/issues/new?template=bug_report.md).
For security vulnerabilities, see [SECURITY.md](./SECURITY.md) — do not file a public issue.

## Code of conduct

This project follows the [Contributor Covenant 2.1](./CODE_OF_CONDUCT.md).
