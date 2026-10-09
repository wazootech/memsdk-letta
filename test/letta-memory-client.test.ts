import { beforeEach, describe, expect, it, vi } from "vitest"
import { LettaMemoryClient } from "../src/index.ts"

const mockAgentCreate = vi.fn()
const mockPassageCreate = vi.fn()
const mockPassageList = vi.fn()
const mockPassageDelete = vi.fn()
const mockPassageSearch = vi.fn()
const mockBlockList = vi.fn()
const mockFolderCreate = vi.fn()
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

function mockPassage(id: string, text: string, tags?: string[]) {
  return { id, text, tags: tags ?? [], created_at: "2026-10-08T16:00:00.000Z" }
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
  mockPassageDelete.mockResolvedValue(undefined)
})

describe("LettaMemoryClient", () => {
  describe("add", () => {
    it("creates a passage on the namespace's agent", async () => {
      mockPassageCreate.mockResolvedValue([
        mockPassage("passage_1", "Dhravya likes ML", ["user_123"]),
      ])

      const client = makeClient()
      const result = await client.add("user_123", { content: "Dhravya likes ML" })

      expect(result).toEqual({ id: "passage_1", status: "queued" })
      expect(mockAgentCreate).toHaveBeenCalledWith({ name: "user_123" })
      expect(mockPassageCreate).toHaveBeenCalledWith("agent_1", {
        text: "Dhravya likes ML",
        tags: ["user_123"],
      })
    })

    it("honors a caller-defined document id", async () => {
      mockPassageCreate.mockResolvedValue([mockPassage("passage_1", "hello")])
      mockPassageList.mockResolvedValue([mockPassage("passage_1", "hello")])

      const client = makeClient()
      const result = await client.add("user_123", {
        content: "hello",
        id: "doc_custom",
      })
      expect(result.id).toBe("doc_custom")

      const doc = await client.documents.get("user_123", "doc_custom")
      expect(doc).toMatchObject({ id: "doc_custom", content: "hello" })
    })
  })

  describe("search", () => {
    it("maps passage search results to v5 memory results", async () => {
      mockPassageSearch.mockResolvedValue({
        results: [{ id: "p1", content: "mem result", score: 0.85, timestamp: "t1" }],
        count: 1,
      })

      const client = makeClient()
      const result = await client.search("user_123", { query: "mem", limit: 5 })

      expect(result.results).toEqual([
        {
          id: "p1",
          memory: "mem result",
          metadata: {},
          similarity: 0.85,
          isLatest: true,
          isInference: false,
          system: { updatedAt: "t1" },
        },
      ])
      expect(typeof result.searchTime).toBe("number")
      expect(mockPassageSearch).toHaveBeenCalledWith("agent_1", {
        query: "mem",
        top_k: 5,
      })
    })

    it("returns chunk-shaped results in chunks mode", async () => {
      mockPassageSearch.mockResolvedValue({
        results: [{ id: "p1", content: "chunk text", score: 0.9, timestamp: "" }],
        count: 1,
      })

      const client = makeClient()
      const result = await client.search("user_123", {
        query: "x",
        searchMode: "chunks",
      })

      expect(result.results[0]?.chunk).toBe("chunk text")
      expect(result.results[0]?.memory).toBeUndefined()
      expect(mockPassageSearch).toHaveBeenCalledWith("agent_1", {
        query: "x",
        top_k: 10,
      })
    })
  })

  describe("profile", () => {
    it("returns blocks as dynamic profile memories", async () => {
      mockBlockList.mockResolvedValue({
        data: [
          mockBlock("b1", "human", "Sarah"),
          mockBlock("b2", "persona", "Friendly"),
        ],
      })

      const client = makeClient()
      const result = await client.profile("user_123")

      expect(result.profile).toEqual({
        static: [],
        dynamic: [
          { id: "b1", memory: "human: Sarah" },
          { id: "b2", memory: "persona: Friendly" },
        ],
        buckets: {},
      })
    })

    it("renders the profile as markdown", async () => {
      mockBlockList.mockResolvedValue({ data: [mockBlock("b1", "human", "Sarah")] })

      const client = makeClient()
      const markdown = await client.profileMarkdown("user_123")

      expect(markdown).toContain("# Profile: user_123")
      expect(markdown).toContain("## Static\n\n_None_")
      expect(markdown).toContain("## Dynamic\n\n- human: Sarah")
    })
  })

  describe("list", () => {
    it("lists passages as documents with pagination", async () => {
      mockPassageList.mockResolvedValue([
        mockPassage("p1", "one"),
        mockPassage("p2", "two"),
        mockPassage("p3", "three"),
      ])

      const client = makeClient()
      const result = await client.list("user_123", "documents", { page: 2, limit: 2 })

      expect(result.documents.map((d) => d.id)).toEqual(["p3"])
      expect(result.chunks).toEqual([])
      expect(result.memories).toEqual([])
      expect(result.pagination).toEqual({
        currentPage: 2,
        limit: 2,
        totalItems: 3,
        totalPages: 2,
      })
    })

    it("lists passages as memories", async () => {
      mockPassageList.mockResolvedValue([mockPassage("p1", "Memory one")])

      const client = makeClient()
      const result = await client.list("user_123", "memories")

      expect(result.memories[0]).toMatchObject({ id: "p1", memory: "Memory one" })
      expect(result.documents).toEqual([])
    })
  })

  describe("documents.get", () => {
    it("gets a document with optional chunks", async () => {
      mockPassageList.mockResolvedValue([mockPassage("p1", "Found me")])

      const client = makeClient()
      const result = await client.documents.get("user_123", "p1", {
        include: ["chunks"],
      })

      expect(result).toMatchObject({ id: "p1", content: "Found me" })
      expect(result.system.status).toBe("done")
      expect(result.chunks?.[0]?.content).toBe("Found me")
      expect(result.memories).toBeUndefined()
    })

    it("throws for an unknown document", async () => {
      mockPassageList.mockResolvedValue([])

      const client = makeClient()
      await expect(client.documents.get("user_123", "unknown")).rejects.toThrow(
        "Document not found: unknown",
      )
    })
  })

  describe("documents.update", () => {
    it("replaces the backing passage but keeps the document id stable", async () => {
      mockPassageCreate
        .mockResolvedValueOnce([mockPassage("p1", "old")])
        .mockResolvedValueOnce([mockPassage("p2", "new content")])
      mockPassageList
        .mockResolvedValueOnce([mockPassage("p1", "old")])
        .mockResolvedValueOnce([mockPassage("p2", "new content")])

      const client = makeClient()
      const { id } = await client.add("user_123", { content: "old" })
      const result = await client.documents.update("user_123", id, {
        content: "new content",
      })

      expect(result).toEqual({ id: "p1", status: "queued" })
      expect(mockPassageDelete).toHaveBeenCalledWith("p1", { agent_id: "agent_1" })

      const doc = await client.documents.get("user_123", "p1")
      expect(doc).toMatchObject({ id: "p1", content: "new content" })
    })
  })

  describe("documents.delete", () => {
    it("deletes passages and reports per-id errors", async () => {
      mockPassageDelete
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error("gone"))

      const client = makeClient()
      const result = await client.documents.delete("user_123", { ids: ["p_a", "p_b"] })

      expect(result).toEqual({ count: 1, errors: [{ id: "p_b", error: "gone" }] })
      expect(mockPassageDelete).toHaveBeenCalledWith("p_a", { agent_id: "agent_1" })
    })
  })

  describe("documents.batchAdd", () => {
    it("adds multiple passages and counts accepted documents", async () => {
      mockPassageCreate
        .mockResolvedValueOnce([mockPassage("p_a", "A")])
        .mockRejectedValueOnce(new Error("boom"))

      const client = makeClient()
      const result = await client.documents.batchAdd("user_123", {
        documents: [{ content: "A" }, { content: "B", id: "doc_b" }],
      })

      expect(result).toEqual({
        results: [
          { id: "p_a", status: "queued" },
          { id: "doc_b", status: "error", error: "boom" },
        ],
        count: 1,
        failed: 1,
      })
    })
  })

  describe("documents.uploadFile", () => {
    it("uploads a file via folder", async () => {
      mockFileUpload.mockResolvedValue({ id: "file_1", processing_status: "completed" })

      const client = makeClient()
      const result = await client.documents.uploadFile("user_123", {
        file: new File(["test content"], "test.txt", { type: "text/plain" }),
      })

      expect(result).toEqual({ id: "file_1", status: "queued" })
      expect(mockFileUpload).toHaveBeenCalledWith("folder_1", {
        file: expect.any(File),
      })
    })

    it("wraps raw bytes with their filename", async () => {
      mockFileUpload.mockResolvedValue({ id: "file_2" })

      const client = makeClient()
      await client.documents.uploadFile("user_123", {
        file: { data: new TextEncoder().encode("bytes"), filename: "notes.md" },
      })

      const uploaded = mockFileUpload.mock.calls[0]?.[1].file as File
      expect(uploaded.name).toBe("notes.md")
      expect(await uploaded.text()).toBe("bytes")
    })

    it("rejects path uploads", async () => {
      const client = makeClient()
      await expect(
        client.documents.uploadFile("user_123", { file: { path: "/tmp/x.txt" } }),
      ).rejects.toThrow("Path uploads are not supported")
    })
  })

  describe("memories", () => {
    it("gets a memory by id", async () => {
      mockPassageList.mockResolvedValue([mockPassage("p1", "likes tea")])

      const client = makeClient()
      const result = await client.memories.get("user_123", "p1")

      expect(result).toMatchObject({
        id: "p1",
        memory: "likes tea",
        isForgotten: false,
      })
    })

    it("forgets memories by id", async () => {
      mockPassageList.mockResolvedValue([mockPassage("p1", "x")])

      const client = makeClient()
      const result = await client.memories.forget("user_123", {
        ids: ["p1", "missing"],
      })

      expect(result).toEqual({
        count: 1,
        matches: [{ id: "p1", memory: "x" }],
        errors: [{ id: "missing", error: "Memory not found: missing" }],
      })
      expect(mockPassageDelete).toHaveBeenCalledTimes(1)
    })

    it("does not support forgetMatching", async () => {
      const client = makeClient()
      await expect(
        client.memories.forgetMatching("user_123", { query: "tea", dryRun: true }),
      ).rejects.toThrow("not supported")
      expect(mockPassageDelete).not.toHaveBeenCalled()
    })
  })

  describe("error handling", () => {
    it("propagates API errors", async () => {
      mockAgentCreate.mockRejectedValue(new Error("API Error: 404 Not Found"))

      const client = makeClient()
      await expect(client.profile("nonexistent")).rejects.toThrow(
        "API Error: 404 Not Found",
      )
    })
  })

  describe("agent cache deduplication", () => {
    it("creates an agent only once for the same namespace", async () => {
      mockPassageCreate
        .mockResolvedValueOnce([mockPassage("p1", "A")])
        .mockResolvedValueOnce([mockPassage("p2", "B")])

      const client = makeClient()
      await Promise.all([
        client.add("shared", { content: "A" }),
        client.add("shared", { content: "B" }),
      ])

      expect(mockAgentCreate).toHaveBeenCalledTimes(1)
      expect(mockPassageCreate).toHaveBeenCalledTimes(2)
    })
  })
})
