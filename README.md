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

The adapter implements the Supermemory **API v5** contract from `memsdk`: every call is
scoped to a namespace passed as the first argument.

```typescript
import { createSupermemory } from "memsdk-letta"

const memory = createSupermemory({
  baseUrl: "http://localhost:8283", // your Letta server URL
  apiKey: "sk-your-api-key",
})

// All SupermemoryInterface methods are available:
await memory.add("user_123", {
  content: "Dhravya prefers ML over traditional programming.",
})

const profile = await memory.profile("user_123")

const docs = await memory.list("user_123", "documents")

const results = await memory.search("user_123", { query: "ML" })
```

For direct access to the underlying class, import `LettaMemoryClient` and construct with
`new`.

## Mapping

| Supermemory v5 concept      | Letta SDK implementation                                                                        |
| --------------------------- | ----------------------------------------------------------------------------------------------- |
| `namespace`                 | Letta agent (one agent per namespace, created via `letta.agents.create`)                        |
| `add()`                     | `letta.agents.passages.create(agentId, { text, tags: [namespace] })`                            |
| `search()`                  | `letta.agents.passages.search(agentId, { query, top_k: limit })`                                |
| `profile()`                 | `letta.agents.blocks.list(agentId, {})`: block labels + values as dynamic memories              |
| `profileMarkdown()`         | `profile()` rendered as markdown                                                                |
| `list()`                    | `letta.agents.passages.list(agentId, {})`, shaped as documents, chunks, or memories             |
| `documents.get()`           | `letta.agents.passages.list(agentId, {})`: find by id                                           |
| `documents.update()`        | `letta.agents.passages.create()` + `letta.agents.passages.delete()` (document id stays stable)  |
| `documents.delete()`        | `letta.agents.passages.delete(id, { agent_id })` per id                                         |
| `documents.batchAdd()`      | `add()` per document                                                                            |
| `documents.uploadFile()`    | `letta.folders.create({ embedding_config })` + `letta.folders.files.upload(folderId, { file })` |
| `memories.get()`            | `letta.agents.passages.list(agentId, {})`: find by id                                           |
| `memories.forget()`         | `letta.agents.passages.delete(id, { agent_id })` per id                                         |
| `memories.forgetMatching()` | Not supported (rejects); see below                                                              |

### Backend limitations

- **Document ids**: Letta passages are immutable and have server-assigned ids. The
  adapter keeps v5's stable-id semantics (caller-defined `id` on `add`, unchanged id
  after `documents.update`) with an in-process alias map, so aliases do not survive a
  process restart.
- **`memories.forgetMatching`** rejects: Letta passage search returns top-k results with
  no relevance threshold, so deleting "whatever matches" could remove unrelated
  memories. Search, then call `memories.forget` with explicit ids.
- **Ignored fields**: `metadata`, `group`, `date`, `supportingContext`, `dreaming`,
  `taskType`, `filter`, `threshold`, `rerank`, and profile `buckets` have no Letta
  equivalent and are accepted but not applied.
- **Uploads**: `{ path }` uploads are rejected; pass file data instead.

## Conformance

- **Required interface conformance**: Every `SupermemoryInterface` method is wired to a
  typed Letta SDK call with matching parameter and response types. Verified at compile
  time via a type-level compatibility test against the v5 contract.
- **Required behavior conformance**: Core flows were verified against a live Letta
  Docker server via [memsdk-e2e](https://github.com/wazootech/memsdk-e2e) for the **v4**
  contract. Re-verification against v5 is pending
  ([memsdk#21](https://github.com/wazootech/memsdk/issues/21)).
- **Optional capability**: `uploadFile` (verified with inline `embedding_config` on v4),
  `withRawResponse()` (not implemented).

## License

MIT
