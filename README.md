# memsdk-letta

Letta-backed implementation of the [memsdk](https://github.com/wazootech/memsdk) Supermemory-compatible memory interface.

This adapter proves that the [`SupermemoryInterface`](https://github.com/wazootech/memsdk) can be implemented by a non-Supermemory backend (Letta) without introducing a translation-layer API for callers.

## Usage

```typescript
import { LettaMemoryClient } from "memsdk-letta"

const client = new LettaMemoryClient({
  baseUrl: "http://localhost:8283", // your Letta server URL
  apiKey: "sk-your-api-key",
})

// All SupermemoryInterface methods are available:
await client.add({ content: "Dhravya prefers ML over traditional programming.", containerTag: "user_123" })

const profile = await client.profile({ containerTag: "user_123" })

const docs = await client.documents.list({ containerTags: ["user_123"] })

const results = await client.search.documents({ q: "ML", containerTag: "user_123" })
```

## Mapping

| Supermemory concept | Letta concept |
|---|---|
| `containerTag` | Letta agent (one agent per tag, created on first use) |
| `client.add()` / `documents.add()` | Passage in archival memory (`POST /v1/agents/{id}/passages`) |
| `client.profile()` | Blocks aggregated (`GET /v1/agents/{id}/blocks`) |
| `documents.*` | Passages CRUD |
| `search.*` | Archival memory search |
| `memories.forget` | Delete passage |
| `memories.updateMemory` | Update block (`PATCH /v1/agents/{id}/blocks/{label}`) |
| `documents.uploadFile` | File upload (minimal, capability-gated) |
| `documents.listProcessing` | Returns empty (capability-gated) |

## Conformance

- **Required interface conformance**: All 14 methods present with matching types
- **Required behavior conformance**: Core add/get/list/search/update/delete flows tested against mocked Letta API
- **Optional capability**: `uploadFile` (basic impl), `listProcessing` (returns empty), `asResponse()`/`withResponse()` (not implemented)

## License

MIT
