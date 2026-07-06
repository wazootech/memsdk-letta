import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { LettaMemoryClient } from "../src/index.ts"

const mockAgentCreate = vi.fn()
const mockPassageCreate = vi.fn()
const mockPassageList = vi.fn()
const mockPassageDelete = vi.fn()
const mockPassageSearch = vi.fn()
const mockBlockList = vi.fn()
const mockBlockUpdate = vi.fn()
const mockFolderCreate = vi.fn().mockResolvedValue({ id: "folder_1", name: "memsdk-uploads" })
const mockFileUpload = vi.fn()

vi.mock("@letta-ai/letta-client", () => ({
  default: vi.fn().mockImplementation(() => ({
    agents: {
      create: mockAgentCreate,
      passages: {
        create: mockPassageCreate,
        list: mockPassageList,
        delete: mockPassageDelete,
        search: mockPassageSearch,
      },
      blocks: {
        list: mockBlockList,
        update: mockBlockUpdate,
      },
    },
    folders: {
      create: mockFolderCreate,
      files: {
        upload: mockFileUpload,
      },
    },
  })),
}))

function mockAgent(id: string, name: string) {
  return { id, name, created_at: new Date().toISOString() }
}

function mockPassage(id: string, text: string, tags?: string[]) {
  return { id, text, tags: tags ?? [], created_at: new Date().toISOString() }
}

function mockBlock(id: string, label: string, value: string) {
  return { id, label, value, limit: 1000 }
}

function makeClient() {
  return new LettaMemoryClient({
    baseUrl: "http://letta.local:8283",
    apiKey: "sk-test",
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAgentCreate.mockResolvedValue({ id: "agent_1", name: "default" })
  mockFolderCreate.mockResolvedValue({ id: "folder_1", name: "memsdk-uploads" })
})

describe("LettaMemoryClient", () => {

  describe("add", () => {
    it("creates a passage via agent", async () => {
      mockPassageCreate.mockResolvedValue([mockPassage("passage_1", "Dhravya likes ML", ["user_123"])])

      const client = makeClient()
      const result = await client.add({
        content: "Dhravya likes ML",
        containerTag: "user_123",
      })

      expect(result).toEqual({ id: "passage_1", status: "queued" })
      expect(mockPassageCreate).toHaveBeenCalledWith(
        expect.any(String),
        { text: "Dhravya likes ML", tags: ["user_123"] },
      )
    })

    it("uses default containerTag when none provided", async () => {
      mockPassageCreate.mockResolvedValue([mockPassage("passage_2", "hello")])

      const client = makeClient()
      const result = await client.add({ content: "hello" })

      expect(result.id).toBe("passage_2")
      expect(mockPassageCreate).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ text: "hello", tags: ["default"] }),
      )
    })
  })

  describe("profile", () => {
    it("returns aggregated block profile", async () => {
      mockBlockList.mockResolvedValue({
        data: [mockBlock("b1", "human", "Sarah"), mockBlock("b2", "persona", "Friendly")],
      })

      const client = makeClient()
      const result = await client.profile({ containerTag: "user_123" })

      expect(result.profile.dynamic).toEqual(["human: Sarah", "persona: Friendly"])
      expect(result.profile.static).toEqual([])
    })

    it("returns empty profile when no blocks", async () => {
      mockBlockList.mockResolvedValue({ data: [] })

      const client = makeClient()
      const result = await client.profile({ containerTag: "empty" })

      expect(result.profile.dynamic).toEqual([])
      expect(result.profile.static).toEqual([])
    })
  })

  describe("documents.list", () => {
    it("lists passages for a containerTag", async () => {
      mockPassageList.mockResolvedValue([
        mockPassage("p1", "Memory one", ["user_123"]),
      ])

      const client = makeClient()
      const result = await client.documents.list({ containerTags: ["user_123"] })

      expect(result.memories).toHaveLength(1)
      expect(result.memories[0]?.id).toBe("p1")
      expect(result.memories[0]?.content).toBe("Memory one")
    })
  })

  describe("documents.get", () => {
    it("gets a passage by id", async () => {
      mockPassageCreate.mockResolvedValue([mockPassage("p1", "prime", ["user_123"])])
      mockPassageList.mockResolvedValue([mockPassage("p1", "Found me", ["user_123"])])

      const client = makeClient()
      await client.add({ content: "prime", containerTag: "user_123" })

      const result = await client.documents.get("p1")
      expect(result.id).toBe("p1")
      expect(result.content).toBe("Found me")
    })

    it("throws for unknown passage", async () => {
      const client = makeClient()
      await expect(client.documents.get("unknown")).rejects.toThrow("Unknown passage: unknown")
    })
  })

  describe("documents.delete", () => {
    it("deletes a passage", async () => {
      mockPassageCreate.mockResolvedValue([mockPassage("p1", "x", ["user_123"])])
      mockPassageDelete.mockResolvedValue(undefined)

      const client = makeClient()
      await client.add({ content: "x", containerTag: "user_123" })

      await client.documents.delete("p1")
      expect(mockPassageDelete).toHaveBeenCalledWith("p1", { agent_id: expect.any(String) })
    })
  })

  describe("documents.update", () => {
    it("deletes and recreates a passage", async () => {
      mockPassageCreate.mockResolvedValueOnce([mockPassage("p1", "old", ["user_123"])])
      mockPassageDelete.mockResolvedValue(undefined)
      mockPassageCreate.mockResolvedValueOnce([mockPassage("p2", "new content", ["user_123"])])

      const client = makeClient()
      await client.add({ content: "old", containerTag: "user_123" })

      const result = await client.documents.update("p1", {
        content: "new content",
        containerTag: "user_123",
      })

      expect(result.status).toBe("queued")
      expect(result.id).toBe("p2")
      expect(mockPassageDelete).toHaveBeenCalledWith("p1", { agent_id: expect.any(String) })
      expect(mockPassageCreate).toHaveBeenCalledTimes(2)
    })
  })

  describe("documents.batchAdd", () => {
    it("adds multiple passages", async () => {
      mockPassageCreate
        .mockResolvedValueOnce([mockPassage("p_a", "A", ["default"])])
        .mockResolvedValueOnce([mockPassage("p_b", "B", ["default"])])

      const client = makeClient()
      const result = await client.documents.batchAdd({
        documents: [{ content: "A" }, { content: "B" }],
      })

      expect(result.success).toBe(2)
      expect(result.failed).toBe(0)
    })
  })

  describe("documents.deleteBulk", () => {
    it("deletes multiple passages", async () => {
      mockPassageCreate
        .mockResolvedValueOnce([mockPassage("p_a", "A", ["default"])])
        .mockResolvedValueOnce([mockPassage("p_b", "B", ["default"])])
      mockPassageDelete.mockResolvedValue(undefined)

      const client = makeClient()
      await client.add({ content: "A", containerTag: "default" })
      await client.add({ content: "B", containerTag: "default" })

      const result = await client.documents.deleteBulk({ ids: ["p_a", "p_b"] })

      expect(result.success).toBe(true)
      expect(result.deletedCount).toBe(2)
    })
  })

  describe("documents.listProcessing", () => {
    it("returns empty", async () => {
      const client = makeClient()
      const result = await client.documents.listProcessing()
      expect(result).toEqual({ documents: [], totalCount: 0 })
    })
  })

  describe("documents.uploadFile", () => {
    it("uploads a file via folder", async () => {
      mockFileUpload.mockResolvedValue({ id: "file_1", processing_status: "completed" })

      const client = makeClient()
      const blob = new Blob(["test content"], { type: "text/plain" })
      const result = await client.documents.uploadFile({
        file: new File([blob], "test.txt", { type: "text/plain" }),
        containerTag: "user_123",
      })

      expect(result.id).toBe("file_1")
      expect(result.status).toBe("queued")
    })
  })

  describe("search.documents", () => {
    it("searches passages via agent", async () => {
      mockPassageSearch.mockResolvedValue({
        results: [{ id: "p1", content: "result", score: 0.95, timestamp: "" }],
        count: 1,
      })

      const client = makeClient()
      const result = await client.search.documents({
        q: "test",
        containerTag: "user_123",
      })

      expect(result.total).toBe(1)
      expect(result.results).toHaveLength(1)
      expect(result.results[0]?.documentId).toBe("p1")
      expect(mockPassageSearch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ query: "test", top_k: 10 }),
      )
    })
  })

  describe("search.execute", () => {
    it("is an alias for search.documents", async () => {
      mockPassageSearch.mockResolvedValue({
        results: [{ id: "p1", content: "exec", score: 0.9, timestamp: "" }],
        count: 1,
      })

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
      mockPassageSearch.mockResolvedValue({
        results: [{ id: "p1", content: "mem result", score: 0.85, timestamp: "" }],
        count: 1,
      })

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
      mockPassageCreate.mockResolvedValue([mockPassage("p1", "x", ["user_123"])])
      mockPassageDelete.mockResolvedValue(undefined)

      const client = makeClient()
      await client.add({ content: "x", containerTag: "user_123" })

      const result = await client.memories.forget({
        containerTag: "user_123",
        id: "p1",
      })

      expect(result.forgotten).toBe(true)
      expect(result.id).toBe("p1")
    })

    it("throws when id is missing", async () => {
      const client = makeClient()
      await expect(
        client.memories.forget({ containerTag: "user_123" } as any),
      ).rejects.toThrow("id is required")
    })
  })

  describe("memories.updateMemory", () => {
    it("finds human block and updates it", async () => {
      mockBlockList.mockResolvedValue({
        data: [mockBlock("b0", "persona", "Friendly"), mockBlock("b1", "human", "old")],
      })
      mockBlockUpdate.mockResolvedValue(mockBlock("b1", "human", "updated memory"))

      const client = makeClient()
      const result = await client.memories.updateMemory({
        containerTag: "user_123",
        content: "old",
        newContent: "updated memory",
      })

      expect(result.memory).toBe("updated memory")
      expect(result.version).toBe(1)
      expect(mockBlockUpdate).toHaveBeenCalledWith(
        "human",
        { agent_id: expect.any(String), value: "updated memory" },
      )
    })

    it("falls back to first block when no human label", async () => {
      mockBlockList.mockResolvedValue({
        data: [mockBlock("b2", "custom", "first")],
      })
      mockBlockUpdate.mockResolvedValue(mockBlock("b2", "custom", "updated"))

      const client = makeClient()
      await client.memories.updateMemory({
        containerTag: "user_123",
        content: "first",
        newContent: "updated",
      })

      expect(mockBlockUpdate).toHaveBeenCalledWith(
        "custom",
        { agent_id: expect.any(String), value: "updated" },
      )
    })
  })

  describe("error handling", () => {
    it("propagates API errors", async () => {
      const apiError = new Error("API Error: 404 Not Found")
      ;(apiError as any).status = 404
      mockAgentCreate.mockRejectedValue(apiError)

      const client = makeClient()
      await expect(
        client.profile({ containerTag: "nonexistent" }),
      ).rejects.toThrow("API Error: 404 Not Found")
    })
  })

  describe("agent cache deduplication", () => {
    it("creates an agent only once for the same tag", async () => {
      mockPassageCreate.mockResolvedValue([mockPassage("p1", "A")])
      mockPassageCreate.mockResolvedValue([mockPassage("p2", "B")])

      const client = makeClient()
      await Promise.all([
        client.add({ content: "A", containerTag: "shared" }),
        client.add({ content: "B", containerTag: "shared" }),
      ])

      expect(mockPassageCreate).toHaveBeenCalledTimes(2)
    })
  })
})
