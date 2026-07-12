# memsdk-letta

Letta-backed implementation of the [memsdk](https://github.com/wazootech/memsdk)
Supermemory-compatible memory interface.

This adapter proves that the
[`SupermemoryInterface`](https://github.com/wazootech/memsdk) can be implemented by a
non-Supermemory backend (Letta) without introducing a translation-layer API for callers.

## Installation

`memsdk-letta` is distributed directly from GitHub. It is not currently published to the
npm registry.

Install with any npm-compatible package manager:

```sh
npm install github:wazootech/memsdk-letta
pnpm add github:wazootech/memsdk-letta
yarn add github:wazootech/memsdk-letta
bun add github:wazootech/memsdk-letta
```

For reproducible installs, pin to a tag or commit:

```sh
npm install github:wazootech/memsdk-letta#<tag-or-commit>
```

The adapter depends on `memsdk` via GitHub as well. During installation, both packages
build from source via `prepare` and expose compiled ESM entrypoints and TypeScript
declarations from `dist`.

### Runtime support

| Runtime            | Status              | Installation path                                                                                                                          |
| ------------------ | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Node.js            | Supported           | `npm install github:wazootech/memsdk-letta`                                                                                                |
| pnpm/yarn projects | Supported           | `pnpm add github:wazootech/memsdk-letta` or `yarn add github:wazootech/memsdk-letta`                                                       |
| Bun                | Supported           | `bun add github:wazootech/memsdk-letta`                                                                                                    |
| Vite/browser apps  | Not first-class     | This adapter talks to a Letta server and depends on the Letta SDK; use server-side unless you have validated browser bundling for your app |
| Deno               | Not first-class yet | Use through npm/package-manager compatibility where available; direct URL imports are not documented yet                                   |
| Browser/CDN        | Not first-class yet | Requires a published package, release artifact, or committed browser build                                                                 |

## Usage

```typescript
import { LettaMemoryClient } from "memsdk-letta"

const client = new LettaMemoryClient({
  baseUrl: "http://localhost:8283", // your Letta server URL
  apiKey: "sk-your-api-key",
})

// All SupermemoryInterface methods are available:
await client.add({
  content: "Dhravya prefers ML over traditional programming.",
  containerTag: "user_123",
})

const profile = await client.profile({ containerTag: "user_123" })

const docs = await client.documents.list({ containerTags: ["user_123"] })

const results = await client.search.documents({ q: "ML", containerTag: "user_123" })
```

## Mapping

| Supermemory concept                | Letta SDK implementation                                                                             |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `containerTag`                     | Letta agent (one agent per tag, created via `letta.agents.create`)                                   |
| `client.add()` / `documents.add()` | `letta.agents.passages.create(agentId, { text, tags })`                                              |
| `client.profile()`                 | `letta.agents.blocks.list(agentId, {})` — aggregated block labels + values                           |
| `documents.get()`                  | `letta.agents.passages.list(agentId, {})` — find by id                                               |
| `documents.list()`                 | `letta.agents.passages.list(agentId, {})`                                                            |
| `documents.update()`               | `letta.agents.passages.delete()` + `letta.agents.passages.create()`                                  |
| `documents.delete()`               | `letta.agents.passages.delete(id, { agent_id })`                                                     |
| `search.*`                         | `letta.agents.passages.search(agentId, { query, top_k })`                                            |
| `memories.forget()`                | `letta.agents.passages.delete(id, { agent_id })`                                                     |
| `memories.updateMemory()`          | `letta.agents.blocks.list()` → find label → `letta.agents.blocks.update(label, { agent_id, value })` |
| `documents.uploadFile()`           | `letta.folders.create({ embedding_config })` + `letta.folders.files.upload(folderId, { file })`      |
| `documents.listProcessing()`       | Returns empty (capability-gated)                                                                     |

## Conformance

- **Required interface conformance**: Every `SupermemoryInterface` method is wired to a
  typed Letta SDK call with matching parameter and response types. Verified at compile
  time via type-level compatibility test.
- **Required behavior conformance**: Core add/get/list/search/update/delete/forget flows
  verified against a live Letta Docker server via
  [memsdk-e2e](https://github.com/wazootech/memsdk-e2e)
- **Optional capability**: `uploadFile` (verified passing with inline
  `embedding_config`), `listProcessing` (returns empty), `asResponse()`/`withResponse()`
  (not implemented)

## License

MIT
