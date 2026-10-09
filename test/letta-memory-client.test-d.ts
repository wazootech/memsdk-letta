import type { SupermemoryInterface } from "memsdk"
import { createSupermemory } from "../src/index.ts"
import type { LettaMemoryClient } from "../src/index.ts"

type Assert<T extends true> = T
type Extends<A, B> = [A] extends [B] ? true : false

type _LettaSatisfiesSupermemory = Assert<
  Extends<LettaMemoryClient, SupermemoryInterface>
>

declare const client: LettaMemoryClient

const factoryClient = createSupermemory({
  baseUrl: "http://localhost:8283",
  apiKey: "test-key",
})
type _FactoryReturnSatisfiesSupermemory = Assert<
  Extends<typeof factoryClient, SupermemoryInterface>
>

await client.add("user_123", { content: "hello", id: "doc_1" })
await client.search("user_123", { query: "hello", searchMode: "hybrid" })
await client.profile("user_123")
await client.profileMarkdown("user_123")
await client.list("user_123", "documents", { limit: 20 })
await client.documents.get("user_123", "doc_1", { include: ["chunks"] })
await client.documents.update("user_123", "doc_1", { content: "updated" })
await client.documents.delete("user_123", { ids: ["doc_1"] })
await client.documents.batchAdd("user_123", { documents: [{ content: "hello" }] })
await client.documents.uploadFile("user_123", { file: new File(["hi"], "hi.txt") })
await client.memories.get("user_123", "mem_1")
await client.memories.forget("user_123", { ids: ["mem_1"] })
await client.memories.forgetMatching("user_123", { query: "hello", dryRun: true })
