# Agent guidelines

## What this repo is

This repository contains the MemSDK Letta integration package.

## How to work here

- Keep integration boundaries clear between MemSDK behavior and Letta-specific adapter
  behavior.
- Use `package.json` scripts for build, test, typecheck, and formatting.
- Run `npm run typecheck` and `npm test` for code changes when practical.
- Document required environment variables or external service assumptions.

## Code health

Family-wide rules live in the
[wazootech workspace constitution](https://github.com/wazootech/workspace/blob/main/AGENTS.md#code-health-standards);
this repo's specifics:

- CI (`.github/workflows/ci.yml`) runs `npm ci`, `npm run format:check`, `npm run lint`,
  and `npm run typecheck`; installs are lockfile-frozen and `.node-version` pins Node.
- Before pushing, run `npx prettier --check .`, `npx eslint . --max-warnings 0`,
  `npm run typecheck`, and `npm test`.
- `no-explicit-any` is an ESLint error. `secret-scan.yml` runs gitleaks, third-party
  actions are pinned to commit SHAs, and `code-health.yml` only warns (file length,
  TODOs without an issue link). `.github/CODEOWNERS` routes review.
