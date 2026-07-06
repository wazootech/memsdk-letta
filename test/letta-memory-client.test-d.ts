import type { SupermemoryInterface } from "memsdk"
import type { LettaMemoryClient } from "../src/index.ts"

type Assert<T extends true> = T
type Extends<A, B> = [A] extends [B] ? true : false

type _LettaSatisfiesSupermemory = Assert<
  Extends<LettaMemoryClient, SupermemoryInterface>
>

declare const client: LettaMemoryClient

await client.add({ content: "hello" })
await client.profile({ containerTag: "user_123" })
await client.documents.add({ content: "hello" })
await client.documents.get("doc_1")
await client.documents.list({ containerTag: "user_123" })
await client.documents.update("doc_1", { content: "updated" })
await client.documents.delete("doc_1")
await client.documents.batchAdd({ documents: [{ content: "hello" }] })
await client.documents.deleteBulk({ ids: ["doc_1"] })
await client.documents.listProcessing()
await client.search.documents({ q: "hello" })
await client.search.execute({ q: "hello" })
await client.search.memories({ q: "hello" })
await client.memories.forget({ containerTag: "user_123", id: "mem_1" })
await client.memories.updateMemory({
  containerTag: "user_123",
  content: "old",
  newContent: "updated",
})
