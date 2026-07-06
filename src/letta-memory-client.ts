import type {
  AddParams,
  AddResponse,
  APIPromise,
  DocumentAddParams,
  DocumentAddResponse,
  DocumentBatchAddParams,
  DocumentBatchAddResponse,
  DocumentDeleteBulkParams,
  DocumentDeleteBulkResponse,
  DocumentGetResponse,
  DocumentListMemory,
  DocumentListParams,
  DocumentListProcessingResponse,
  DocumentListResponse,
  DocumentType,
  DocumentUpdateParams,
  DocumentUpdateResponse,
  DocumentUploadFileParams,
  DocumentUploadFileResponse,
  MemoryForgetParams,
  MemoryForgetResponse,
  MemoryUpdateMemoryParams,
  MemoryUpdateMemoryResponse,
  ProfileParams,
  ProfileResponse,
  RequestOptions,
  SearchDocumentsParams,
  SearchDocumentsResponse,
  SearchExecuteParams,
  SearchExecuteResponse,
  SearchMemoriesParams,
  SearchMemoriesResponse,
  SearchMemoryResult,
  Uploadable,
} from "memsdk"
import { AgentCache } from "./agent-cache.js"
import { LettaHttpClient } from "./http-client.js"
import type {
  LettaArchivalSearchResponse,
  LettaBlock,
  LettaPassage,
} from "./types.js"

export interface LettaMemoryClientOptions {
  baseUrl: string
  apiKey: string
}

function apiPromise<T>(value: T): APIPromise<T> {
  return Promise.resolve(value) as APIPromise<T>
}

function rejectPromise<T>(error: Error): APIPromise<T> {
  return Promise.reject(error) as APIPromise<T>
}

function passageToDocumentListMemory(
  passage: LettaPassage,
  containerTag: string,
): DocumentListMemory {
  return {
    id: passage.id,
    connectionId: null,
    createdAt: passage.created_at,
    customId: null,
    filepath: null,
    metadata: null,
    status: "done",
    summary: null,
    title: null,
    type: "text" as DocumentType,
    updatedAt: passage.updated_at ?? passage.created_at,
    content: passage.text,
    containerTags: [containerTag],
  }
}

function passageToDocumentGetResponse(
  passage: LettaPassage,
  containerTag: string,
): DocumentGetResponse {
  return {
    id: passage.id,
    connectionId: null,
    content: passage.text,
    createdAt: passage.created_at,
    customId: null,
    filepath: null,
    metadata: null,
    ogImage: null,
    raw: null,
    source: null,
    spatialPoint: null,
    status: "done",
    summary: null,
    taskType: "memory",
    title: null,
    type: "text" as DocumentType,
    updatedAt: passage.updated_at ?? passage.created_at,
    containerTags: [containerTag],
  }
}

function mapSearchResult(source: LettaArchivalSearchResponse): SearchDocumentsResponse {
  return {
    results: source.results.map((r) => ({
      chunks: [{ content: r.text, isRelevant: true, score: r.score }],
      createdAt: "",
      documentId: r.id,
      metadata: r.metadata ?? null,
      score: r.score,
      title: null,
      type: null,
      updatedAt: "",
    })),
    timing: 0,
    total: source.count,
  }
}

function uploadableToBlob(file: Uploadable): Blob {
  if (file instanceof Blob) return file
  if (file instanceof Response) return file.blob() as unknown as Blob
  return new Blob()
}

class LettaDocumentsAdapter {
  constructor(
    private readonly client: LettaMemoryClient,
    private readonly agentCache: AgentCache,
    private readonly http: LettaHttpClient,
  ) {}

  add(body: DocumentAddParams, _options?: RequestOptions): APIPromise<DocumentAddResponse> {
    return this.client.add(body, _options) as APIPromise<DocumentAddResponse>
  }

  get(id: string, _options?: RequestOptions): APIPromise<DocumentGetResponse> {
    const agentId = this.agentCache.getAgentIdForPassage(id)
    if (!agentId) {
      return rejectPromise(new Error(`Unknown passage: ${id}. Try listing passages first.`))
    }
    return this.http
      .get<LettaPassage[]>(`/v1/agents/${agentId}/passages`)
      .then((passages) => {
        const passage = passages.find((p) => p.id === id)
        if (!passage) throw new Error(`Passage not found: ${id}`)
        const tag = this.agentCache.getTagForAgentId(agentId) ?? "unknown"
        return passageToDocumentGetResponse(passage, tag)
      })
  }

  list(body: DocumentListParams, _options?: RequestOptions): APIPromise<DocumentListResponse> {
    const tag = body.containerTags?.[0] ?? "default"
    return this.agentCache.resolveAgentId(tag).then((agentId) =>
      this.http
        .get<LettaPassage[]>(`/v1/agents/${agentId}/passages`)
        .then((passages) => {
          const memories = passages.map((p) => passageToDocumentListMemory(p, tag))
          return {
            memories,
            pagination: {
              currentPage: 1,
              totalItems: memories.length,
              totalPages: 1,
              limit: memories.length,
            },
          } as DocumentListResponse
        }),
    )
  }

  update(
    id: string,
    body: DocumentUpdateParams,
    _options?: RequestOptions,
  ): APIPromise<DocumentUpdateResponse> {
    const agentId = this.agentCache.getAgentIdForPassage(id)
    if (!agentId) {
      return rejectPromise(new Error(`Unknown passage: ${id}. Try listing passages first.`))
    }
    return this.http
      .delete(`/v1/agents/${agentId}/passages/${id}`)
      .then(() =>
        this.http
          .post<{ id: string }>(`/v1/agents/${agentId}/passages`, {
            text: body.content ?? "",
            tags: body.containerTag ? [body.containerTag] : undefined,
          })
          .then((result) => {
            this.agentCache.recordPassage(result.id, agentId)
            return { id: result.id, status: "queued" } as DocumentUpdateResponse
          }),
      )
  }

  delete(id: string, _options?: RequestOptions): APIPromise<void> {
    const agentId = this.agentCache.getAgentIdForPassage(id)
    if (!agentId) {
      return rejectPromise(new Error(`Unknown passage: ${id}. Try listing passages first.`))
    }
    return this.http.delete(`/v1/agents/${agentId}/passages/${id}`)
  }

  batchAdd(
    body: DocumentBatchAddParams,
    _options?: RequestOptions,
  ): APIPromise<DocumentBatchAddResponse> {
    const docs = body.documents
    const addPromises = docs.map((doc) => {
      const params: AddParams =
        typeof doc === "string" ? { content: doc } : (doc as AddParams)
      return this.client
        .add(params)
        .then((r) => ({ id: r.id, status: r.status } as const))
        .catch((err: Error) => ({ error: err.message } as const))
    })
    return Promise.all(addPromises).then((results) => {
      const errors = results.filter((r) => "error" in r)
      return {
        failed: errors.length,
        results: results.map((r) =>
          "status" in r
            ? { id: r.id, status: r.status }
            : { id: "", status: "error", error: r.error },
        ),
        success: results.length - errors.length,
      } as DocumentBatchAddResponse
    })
  }

  deleteBulk(
    body: DocumentDeleteBulkParams,
    _options?: RequestOptions,
  ): APIPromise<DocumentDeleteBulkResponse> {
    const ids = body.ids ?? []
    const deletePromises = ids.map((id) =>
      this.delete(id)
        .then(() => "fulfilled" as const)
        .catch((err: Error) => ({ id, error: err.message }) as const),
    )
    return Promise.all(deletePromises).then((results) => {
      let successCount = 0
      const errors: Array<{ id: string; error: string }> = []
      for (const r of results) {
        if (r === "fulfilled") {
          successCount++
        } else {
          errors.push({ id: r.id, error: r.error })
        }
      }
      return {
        deletedCount: successCount,
        success: errors.length === 0,
        errors,
      } as DocumentDeleteBulkResponse
    })
  }

  listProcessing(_options?: RequestOptions): APIPromise<DocumentListProcessingResponse> {
    return apiPromise({ documents: [], totalCount: 0 })
  }

  uploadFile(
    body: DocumentUploadFileParams,
    _options?: RequestOptions,
  ): APIPromise<DocumentUploadFileResponse> {
    const tag = body.containerTag ?? "default"
    return this.agentCache.resolveAgentId(tag).then((agentId) => {
      const formData = new FormData()
      const blob = uploadableToBlob(body.file)
      formData.append("file", blob)
      const url = `${this.http.baseUrl}/v1/agents/${agentId}/files`
      return globalThis
        .fetch(url, {
          method: "POST",
          headers: { Authorization: `Bearer ${this.http.apiKey}` },
          body: formData,
        })
        .then((response) => {
          if (!response.ok) {
            throw new Error(`File upload failed: ${response.status}`)
          }
          return response.json() as Promise<{ id?: string }>
        })
        .then(
          (result) =>
            ({ id: result.id ?? "file_uploaded", status: "queued" }) as DocumentUploadFileResponse,
        )
    })
  }
}

class LettaSearchAdapter {
  constructor(
    private readonly agentCache: AgentCache,
    private readonly http: LettaHttpClient,
  ) {}

  documents(
    body: SearchDocumentsParams,
    _options?: RequestOptions,
  ): APIPromise<SearchDocumentsResponse> {
    const tag = body.containerTag ?? body.containerTags?.[0] ?? "default"
    return this.agentCache.resolveAgentId(tag).then((agentId) => {
      const encodedQuery = encodeURIComponent(body.q)
      return this.http
        .get<LettaArchivalSearchResponse>(
          `/v1/agents/${agentId}/archival-memory/search?query=${encodedQuery}`,
        )
        .then(mapSearchResult)
    })
  }

  execute(
    body: SearchExecuteParams,
    _options?: RequestOptions,
  ): APIPromise<SearchExecuteResponse> {
    return this.documents(body, _options) as APIPromise<SearchExecuteResponse>
  }

  memories(
    body: SearchMemoriesParams,
    _options?: RequestOptions,
  ): APIPromise<SearchMemoriesResponse> {
    const tag = body.containerTag ?? "default"
    return this.agentCache.resolveAgentId(tag).then((agentId) => {
      const encodedQuery = encodeURIComponent(body.q)
      return this.http
        .get<LettaArchivalSearchResponse>(
          `/v1/agents/${agentId}/archival-memory/search?query=${encodedQuery}`,
        )
        .then((raw) => {
          const results: SearchMemoryResult[] = raw.results.map((r) => ({
            id: r.id,
            metadata: r.metadata ?? null,
            similarity: r.score,
            updatedAt: "",
            memory: r.text,
            chunk: r.text,
          }))
          return { results, timing: 0, total: raw.count } as SearchMemoriesResponse
        })
    })
  }
}

class LettaMemoriesAdapter {
  constructor(
    private readonly agentCache: AgentCache,
    private readonly http: LettaHttpClient,
  ) {}

  forget(
    body: MemoryForgetParams,
    _options?: RequestOptions,
  ): APIPromise<MemoryForgetResponse> {
    if (!body.id) {
      return rejectPromise(new Error("id is required for memories.forget"))
    }
    const agentId = this.agentCache.getAgentIdForPassage(body.id)
    if (!agentId) {
      return rejectPromise(new Error(`Unknown passage: ${body.id}`))
    }
    return this.http
      .delete(`/v1/agents/${agentId}/passages/${body.id}`)
      .then(() => ({ id: body.id!, forgotten: true }) as MemoryForgetResponse)
  }

  updateMemory(
    body: MemoryUpdateMemoryParams,
    _options?: RequestOptions,
  ): APIPromise<MemoryUpdateMemoryResponse> {
    return this.agentCache
      .resolveAgentId(body.containerTag)
      .then((agentId) =>
        this.http
          .get<LettaBlock[]>(`/v1/agents/${agentId}/blocks`)
          .then((blocks) => {
            const targetBlock = blocks.find((b) => b.label === "memory")
            const blockId = targetBlock?.id ?? "memory"
            return this.http.patch<{ id: string; value: string; created_at: string }>(
              `/v1/agents/${agentId}/blocks/${blockId}`,
              { value: body.newContent },
            )
          }),
      )
      .then(
        (result) =>
          ({
            id: result.id,
            createdAt: result.created_at,
            forgetAfter: null,
            forgetReason: null,
            memory: body.newContent,
            parentMemoryId: null,
            rootMemoryId: null,
            version: 1,
          }) as MemoryUpdateMemoryResponse,
      )
  }
}

export class LettaMemoryClient {
  readonly documents: LettaDocumentsAdapter
  readonly search: LettaSearchAdapter
  readonly memories: LettaMemoriesAdapter

  private readonly agentCache: AgentCache
  private readonly http: LettaHttpClient

  constructor(options: LettaMemoryClientOptions) {
    this.http = new LettaHttpClient(options)
    this.agentCache = new AgentCache(this.http)
    this.documents = new LettaDocumentsAdapter(this, this.agentCache, this.http)
    this.search = new LettaSearchAdapter(this.agentCache, this.http)
    this.memories = new LettaMemoriesAdapter(this.agentCache, this.http)
  }

  add(
    body: AddParams,
    _options?: RequestOptions,
  ): APIPromise<AddResponse> {
    const tag = body.containerTag ?? body.containerTags?.[0] ?? "default"
    return this.agentCache.resolveAgentId(tag).then((agentId) =>
      this.http
        .post<{ id: string }>(`/v1/agents/${agentId}/passages`, {
          text: body.content,
          tags: [tag],
        })
        .then((result) => {
          this.agentCache.recordPassage(result.id, agentId)
          return { id: result.id, status: "queued" } as AddResponse
        }),
    )
  }

  profile(
    body: ProfileParams,
    _options?: RequestOptions,
  ): APIPromise<ProfileResponse> {
    return this.agentCache.resolveAgentId(body.containerTag).then((agentId) =>
      this.http
        .get<LettaBlock[]>(`/v1/agents/${agentId}/blocks`)
        .then(
          (blocks) =>
            ({
              profile: {
                dynamic: blocks.map((b) => `${b.label}: ${b.value}`),
                static: [],
              },
            }) as ProfileResponse,
        ),
    )
  }
}
