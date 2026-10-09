import { describe, expect, it } from "vitest"
import { createSupermemory, LettaMemoryClient } from "../src/index.ts"

describe("memsdk-letta exports", () => {
  it("exposes LettaMemoryClient class", () => {
    const client = new LettaMemoryClient({
      baseUrl: "http://localhost:8283",
      apiKey: "test-key",
    })
    expect(client).toBeInstanceOf(LettaMemoryClient)
    for (const method of [
      "add",
      "search",
      "profile",
      "profileMarkdown",
      "list",
    ] as const) {
      expect(typeof client[method]).toBe("function")
    }
    for (const method of [
      "get",
      "update",
      "delete",
      "batchAdd",
      "uploadFile",
    ] as const) {
      expect(typeof client.documents[method]).toBe("function")
    }
    for (const method of ["get", "forget", "forgetMatching"] as const) {
      expect(typeof client.memories[method]).toBe("function")
    }
  })

  it("exposes a createSupermemory factory returning a SupermemoryInterface", () => {
    const client = createSupermemory({
      baseUrl: "http://localhost:8283",
      apiKey: "test-key",
    })
    expect(client).toBeInstanceOf(LettaMemoryClient)
    expect(typeof client.add).toBe("function")
    expect(typeof client.profile).toBe("function")
  })
})
