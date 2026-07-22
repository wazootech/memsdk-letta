# Agent guidelines

## What this repo is

This repository contains the MemSDK Letta integration package.

## How to work here

- Keep integration boundaries clear between MemSDK behavior and Letta-specific
  adapter behavior.
- Use `package.json` scripts for build, test, typecheck, and formatting.
- Run `npm run typecheck` and `npm test` for code changes when practical.
- Document required environment variables or external service assumptions.
