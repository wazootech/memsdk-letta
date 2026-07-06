import { describe, expect, it } from "vitest"
import { LettaMemoryClient } from "../src/index.ts"

describe("memsdk-letta exports", () => {
  it("exposes LettaMemoryClient class", () => {
    const client = new LettaMemoryClient({
      baseUrl: "http://localhost:8283",
      apiKey: "test-key",
    })
    expect(client).toBeInstanceOf(LettaMemoryClient)
    expect(typeof client.add).toBe("function")
    expect(typeof client.profile).toBe("function")
    expect(typeof client.documents.add).toBe("function")
    expect(typeof client.documents.get).toBe("function")
    expect(typeof client.documents.list).toBe("function")
    expect(typeof client.documents.delete).toBe("function")
    expect(typeof client.documents.update).toBe("function")
    expect(typeof client.documents.batchAdd).toBe("function")
    expect(typeof client.documents.deleteBulk).toBe("function")
    expect(typeof client.documents.listProcessing).toBe("function")
    expect(typeof client.documents.uploadFile).toBe("function")
    expect(typeof client.search.documents).toBe("function")
    expect(typeof client.search.execute).toBe("function")
    expect(typeof client.search.memories).toBe("function")
    expect(typeof client.memories.forget).toBe("function")
    expect(typeof client.memories.updateMemory).toBe("function")
  })
})
