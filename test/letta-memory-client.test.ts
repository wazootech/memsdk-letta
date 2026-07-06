import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { LettaMemoryClient, LettaHttpError } from "../src/index.ts"

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function makeClient() {
  return new LettaMemoryClient({
    baseUrl: "http://letta.local:8283",
    apiKey: "sk-test",
  })
}

describe("LettaMemoryClient", () => {
  let fetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetch = vi.fn()
    vi.spyOn(globalThis, "fetch").mockImplementation(fetch)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("add", () => {
    it("creates a passage via agent", async () => {
      fetch.mockResolvedValueOnce(jsonResponse({ id: "agent_1", name: "user_123" }))
      fetch.mockResolvedValueOnce(jsonResponse({ id: "passage_1" }))

      const client = makeClient()
      const result = await client.add({
        content: "Dhravya likes ML",
        containerTag: "user_123",
      })

      expect(result).toEqual({ id: "passage_1", status: "queued" })
      expect(fetch.mock.calls[0]?.[0]).toContain("/v1/agents")
      expect(fetch.mock.calls[1]?.[0]).toContain("/v1/agents/agent_1/passages")
      const body = JSON.parse(
        (fetch.mock.calls[1]?.[1] as RequestInit)?.body as string,
      )
      expect(body).toMatchObject({ text: "Dhravya likes ML", tags: ["user_123"] })
    })
  })

  describe("profile", () => {
    it("returns aggregated block profile", async () => {
      fetch.mockResolvedValueOnce(jsonResponse({ id: "agent_1", name: "user_123" }))
      fetch.mockResolvedValueOnce(
        jsonResponse([
          { id: "b1", label: "human", value: "Sarah", limit: 1000 },
          { id: "b2", label: "persona", value: "Friendly", limit: 1000 },
        ]),
      )

      const client = makeClient()
      const result = await client.profile({ containerTag: "user_123" })

      expect(result.profile.dynamic).toEqual(["human: Sarah", "persona: Friendly"])
      expect(result.profile.static).toEqual([])
    })
  })

  describe("documents.list", () => {
    it("lists passages for a containerTag", async () => {
      fetch.mockResolvedValueOnce(jsonResponse({ id: "agent_1", name: "user_123" }))
      fetch.mockResolvedValueOnce(
        jsonResponse([
          {
            id: "p1",
            text: "Memory one",
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-02T00:00:00Z",
          },
        ]),
      )

      const client = makeClient()
      const result = await client.documents.list({ containerTags: ["user_123"] })

      expect(result.memories).toHaveLength(1)
      expect(result.memories[0]?.id).toBe("p1")
      expect(result.memories[0]?.content).toBe("Memory one")
    })
  })

  describe("documents.get", () => {
    it("gets a passage by id", async () => {
      // add primes the agent+passage cache
      fetch.mockResolvedValueOnce(jsonResponse({ id: "agent_1", name: "user_123" }))
      fetch.mockResolvedValueOnce(jsonResponse({ id: "p1" }))

      const client = makeClient()
      await client.add({ content: "prime", containerTag: "user_123" })

      // reset mocks for the get call
      fetch.mockReset()
      fetch.mockResolvedValueOnce(
        jsonResponse([
          { id: "p1", text: "Found me", created_at: "2026-01-01T00:00:00Z" },
        ]),
      )

      const result = await client.documents.get("p1")
      expect(result.id).toBe("p1")
      expect(result.content).toBe("Found me")
    })

    it("throws for unknown passage", async () => {
      const client = makeClient()
      await expect(client.documents.get("unknown")).rejects.toThrow(
        "Unknown passage: unknown",
      )
    })
  })

  describe("documents.delete", () => {
    it("deletes a passage", async () => {
      fetch.mockResolvedValueOnce(jsonResponse({ id: "agent_1", name: "user_123" }))
      fetch.mockResolvedValueOnce(jsonResponse({ id: "p1" }))

      const client = makeClient()
      await client.add({ content: "x", containerTag: "user_123" })

      fetch.mockReset()
      fetch.mockResolvedValueOnce(new Response(null, { status: 204 }))

      await client.documents.delete("p1")
      expect(fetch).toHaveBeenCalledTimes(1)
      expect(fetch.mock.calls[0]?.[0]).toContain("/v1/agents/agent_1/passages/p1")
    })
  })

  describe("documents.batchAdd", () => {
    it("adds multiple passages", async () => {
      // Agent created once (pending promise cache dedupes), then two passage creates
      fetch.mockResolvedValueOnce(jsonResponse({ id: "agent_1", name: "default" }))
      fetch.mockResolvedValueOnce(jsonResponse({ id: "p_a" }))
      fetch.mockResolvedValueOnce(jsonResponse({ id: "p_b" }))

      const client = makeClient()
      const result = await client.documents.batchAdd({
        documents: [{ content: "A" }, { content: "B" }],
      })

      expect(result.success).toBe(2)
      expect(result.failed).toBe(0)
    })
  })

  describe("documents.listProcessing", () => {
    it("returns empty", async () => {
      const client = makeClient()
      const result = await client.documents.listProcessing()
      expect(result).toEqual({ documents: [], totalCount: 0 })
    })
  })

  describe("search", () => {
    it("searches archival memory", async () => {
      fetch.mockResolvedValueOnce(jsonResponse({ id: "agent_1", name: "user_123" }))
      fetch.mockResolvedValueOnce(
        jsonResponse({
          results: [{ id: "p1", text: "result", score: 0.95 }],
          count: 1,
        }),
      )

      const client = makeClient()
      const result = await client.search.documents({
        q: "test",
        containerTag: "user_123",
      })

      expect(result.total).toBe(1)
      expect(result.results).toHaveLength(1)
      expect(result.results[0]?.documentId).toBe("p1")
    })
  })

  describe("search.execute", () => {
    it("is an alias for search.documents", async () => {
      fetch.mockResolvedValueOnce(jsonResponse({ id: "agent_1", name: "user_123" }))
      fetch.mockResolvedValueOnce(
        jsonResponse({
          results: [{ id: "p1", text: "exec", score: 0.9 }],
          count: 1,
        }),
      )

      const client = makeClient()
      const result = await client.search.execute({
        q: "exec",
        containerTag: "user_123",
      })

      expect(result.total).toBe(1)
    })
  })

  describe("search.memories", () => {
    it("returns memory-shaped search results", async () => {
      fetch.mockResolvedValueOnce(jsonResponse({ id: "agent_1", name: "user_123" }))
      fetch.mockResolvedValueOnce(
        jsonResponse({
          results: [{ id: "p1", text: "mem result", score: 0.85 }],
          count: 1,
        }),
      )

      const client = makeClient()
      const result = await client.search.memories({
        q: "mem",
        containerTag: "user_123",
      })

      expect(result.total).toBe(1)
      expect(result.results[0]?.memory).toBe("mem result")
      expect(result.results[0]?.similarity).toBe(0.85)
    })
  })

  describe("memories.forget", () => {
    it("forgets a passage", async () => {
      fetch.mockResolvedValueOnce(jsonResponse({ id: "agent_1", name: "user_123" }))
      fetch.mockResolvedValueOnce(jsonResponse({ id: "p1" }))

      const client = makeClient()
      await client.add({ content: "x", containerTag: "user_123" })

      fetch.mockReset()
      fetch.mockResolvedValueOnce(new Response(null, { status: 204 }))

      const result = await client.memories.forget({
        containerTag: "user_123",
        id: "p1",
      })

      expect(result.forgotten).toBe(true)
      expect(result.id).toBe("p1")
    })
  })

  describe("memories.updateMemory", () => {
    it("updates a block", async () => {
      fetch.mockResolvedValueOnce(jsonResponse({ id: "agent_1", name: "user_123" }))
      fetch.mockResolvedValueOnce(
        jsonResponse([
          { id: "b1", label: "memory", value: "old", limit: 1000 },
        ]),
      )
      fetch.mockResolvedValueOnce(
        jsonResponse({
          id: "b1",
          value: "updated memory",
          created_at: "2026-01-01T00:00:00Z",
        }),
      )

      const client = makeClient()
      const result = await client.memories.updateMemory({
        containerTag: "user_123",
        content: "old",
        newContent: "updated memory",
      })

      expect(result.memory).toBe("updated memory")
      expect(result.version).toBe(1)
    })
  })

  describe("error handling", () => {
    it("throws LettaHttpError on non-2xx", async () => {
      fetch.mockResolvedValueOnce(jsonResponse({ detail: "Not found" }, 404))

      const client = makeClient()
      await expect(
        client.profile({ containerTag: "nonexistent" }),
      ).rejects.toThrow(LettaHttpError)
    })
  })
})
