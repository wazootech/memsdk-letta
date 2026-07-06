import Letta, { type Uploadable as LettaUploadable } from "@letta-ai/letta-client"
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

export interface LettaMemoryClientOptions {
  baseUrl: string
  apiKey: string
  model?: string
}

function wrap<T>(p: Promise<T>): APIPromise<T> {
  return p as APIPromise<T>
}

function reject<T>(msg: string): APIPromise<T> {
  return Promise.reject(new Error(msg)) as APIPromise<T>
}

function passageToDocumentListMemory(
  passage: { id?: string; text: string; created_at?: string | null; updated_at?: string | null; tags?: Array<string> | null },
  containerTag: string,
): DocumentListMemory {
  return {
    id: passage.id ?? "",
    connectionId: null,
    createdAt: passage.created_at ?? new Date().toISOString(),
    customId: null,
    filepath: null,
    metadata: null,
    status: "done",
    summary: null,
    title: null,
    type: "text" as DocumentType,
    updatedAt: passage.updated_at ?? passage.created_at ?? new Date().toISOString(),
    content: passage.text,
    containerTags: [containerTag],
  }
}

function passageToDocumentGetResponse(
  passage: { id?: string; text: string; created_at?: string | null; updated_at?: string | null; tags?: Array<string> | null },
  containerTag: string,
): DocumentGetResponse {
  return {
    id: passage.id ?? "",
    connectionId: null,
    content: passage.text,
    createdAt: passage.created_at ?? new Date().toISOString(),
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
    updatedAt: passage.updated_at ?? passage.created_at ?? new Date().toISOString(),
    containerTags: [containerTag],
  }
}

function uploadableToLetta(file: Uploadable): LettaUploadable {
  if (file instanceof File) return file
  if (file instanceof Blob) return new File([file], "upload.bin")
  if (file instanceof Response) return file.blob() as unknown as LettaUploadable
  return new File([], "upload.bin")
}

class LettaDocumentsAdapter {
  constructor(
    private readonly client: LettaMemoryClient,
    private readonly cache: AgentCache,
    private readonly letta: Letta,
  ) {}

  add(body: DocumentAddParams, _opts?: RequestOptions): APIPromise<DocumentAddResponse> {
    return this.client.add(body, _opts) as APIPromise<DocumentAddResponse>
  }

  get(id: string, _opts?: RequestOptions): APIPromise<DocumentGetResponse> {
    const agentId = this.cache.getAgentIdForPassage(id)
    if (!agentId) return reject(`Unknown passage: ${id}`)
    return wrap(
      this.letta.agents.passages.list(agentId, {}).then((passages) => {
        const p = passages.find((p) => p.id === id)
        if (!p) throw new Error(`Passage not found: ${id}`)
        const tag = this.cache.getTagForAgentId(agentId) ?? "unknown"
        return passageToDocumentGetResponse(p, tag)
      }),
    )
  }

  list(body: DocumentListParams, _opts?: RequestOptions): APIPromise<DocumentListResponse> {
    const tag = body.containerTags?.[0] ?? "default"
    return wrap(
      this.cache.resolveAgentId(tag).then((agentId) =>
        this.letta.agents.passages.list(agentId, {}).then((passages) => {
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
      ),
    )
  }

  update(id: string, body: DocumentUpdateParams, _opts?: RequestOptions): APIPromise<DocumentUpdateResponse> {
    const agentId = this.cache.getAgentIdForPassage(id)
    if (!agentId) return reject(`Unknown passage: ${id}`)
    return wrap(
      this.letta.agents.passages
        .delete(id, { agent_id: agentId })
        .then(() =>
          this.letta.agents.passages.create(agentId, {
            text: body.content ?? "",
            tags: body.containerTag ? [body.containerTag] : null,
          }),
        )
        .then((result) => {
          const passage = result[0]!
          this.cache.recordPassage(passage.id!, agentId)
          return { id: passage.id!, status: "queued" } as DocumentUpdateResponse
        }),
    )
  }

  delete(id: string, _opts?: RequestOptions): APIPromise<void> {
    const agentId = this.cache.getAgentIdForPassage(id)
    if (!agentId) return reject(`Unknown passage: ${id}`)
    return this.letta.agents.passages.delete(id, { agent_id: agentId }) as APIPromise<void>
  }

  batchAdd(body: DocumentBatchAddParams, _opts?: RequestOptions): APIPromise<DocumentBatchAddResponse> {
    const docs = body.documents
    const addPromises = docs.map((doc) => {
      const params: AddParams = typeof doc === "string" ? { content: doc } : (doc as AddParams)
      return this.client
        .add(params)
        .then((r) => ({ id: r.id, status: r.status } as const))
        .catch((err: Error) => ({ error: err.message } as const))
    })
    return wrap(
      Promise.all(addPromises).then((results) => {
        const errors = results.filter((r) => "error" in r)
        return {
          failed: errors.length,
          results: results.map((r) =>
            "status" in r ? { id: r.id, status: r.status } : { id: "", status: "error", error: r.error },
          ),
          success: results.length - errors.length,
        } as DocumentBatchAddResponse
      }),
    )
  }

  deleteBulk(body: DocumentDeleteBulkParams, _opts?: RequestOptions): APIPromise<DocumentDeleteBulkResponse> {
    const ids = body.ids ?? []
    const deletePromises = ids.map((id) =>
      this.delete(id)
        .then(() => "fulfilled" as const)
        .catch((err: Error) => ({ id, error: err.message }) as const),
    )
    return wrap(
      Promise.all(deletePromises).then((results) => {
        let successCount = 0
        const errors: Array<{ id: string; error: string }> = []
        for (const r of results) {
          if (r === "fulfilled") successCount++
          else errors.push({ id: r.id, error: r.error })
        }
        return { deletedCount: successCount, success: errors.length === 0, errors } as DocumentDeleteBulkResponse
      }),
    )
  }

  listProcessing(_opts?: RequestOptions): APIPromise<DocumentListProcessingResponse> {
    return wrap(Promise.resolve({ documents: [], totalCount: 0 }))
  }

  uploadFile(body: DocumentUploadFileParams, _opts?: RequestOptions): APIPromise<DocumentUploadFileResponse> {
    return wrap(
      this.cache.resolveFolderId().then(
        (folderId) => {
          const file = uploadableToLetta(body.file)
          return this.letta.folders.files.upload(folderId, { file }).then((result) => ({
            id: result.id ?? "file_uploaded",
            status: "queued",
          })) as Promise<DocumentUploadFileResponse>
        },
        (err) => {
          throw new Error(
            `File upload requires an embedding model configured on the Letta server. ` +
            `Create a folder with an embedding model or set an embedding on the server. ` +
            `Server error: ${(err as Error).message}`
          )
        },
      ),
    )
  }
}

class LettaSearchAdapter {
  constructor(
    private readonly cache: AgentCache,
    private readonly letta: Letta,
  ) {}

  documents(body: SearchDocumentsParams, _opts?: RequestOptions): APIPromise<SearchDocumentsResponse> {
    const tag = body.containerTag ?? body.containerTags?.[0] ?? "default"
    return wrap(
      this.cache.resolveAgentId(tag).then((agentId) =>
        this.letta.agents.passages.search(agentId, { query: body.q, top_k: 10 }).then((result) => ({
          results: result.results.map((r: any) => ({
            chunks: [{ content: r.content ?? r.text, isRelevant: true, score: r.score ?? 0 }],
            createdAt: r.timestamp ?? "",
            documentId: r.id,
            metadata: r.metadata ?? null,
            score: r.score ?? 0,
            title: null,
            type: null,
            updatedAt: "",
          })),
          timing: 0,
          total: result.count,
        })),
      ),
    )
  }

  execute(body: SearchExecuteParams, _opts?: RequestOptions): APIPromise<SearchExecuteResponse> {
    return this.documents(body, _opts) as APIPromise<SearchExecuteResponse>
  }

  memories(body: SearchMemoriesParams, _opts?: RequestOptions): APIPromise<SearchMemoriesResponse> {
    const tag = body.containerTag ?? "default"
    return wrap(
      this.cache.resolveAgentId(tag).then((agentId) =>
        this.letta.agents.passages.search(agentId, { query: body.q, top_k: 10 }).then((result) => {
          const results: SearchMemoryResult[] = result.results.map((r: any) => ({
            id: r.id,
            metadata: r.metadata ?? null,
            similarity: r.score ?? 0,
            updatedAt: "",
            memory: r.content ?? r.text,
            chunk: r.content ?? r.text,
          }))
          return { results, timing: 0, total: result.count } as SearchMemoriesResponse
        }),
      ),
    )
  }
}

class LettaMemoriesAdapter {
  constructor(
    private readonly cache: AgentCache,
    private readonly letta: Letta,
  ) {}

  forget(body: MemoryForgetParams, _opts?: RequestOptions): APIPromise<MemoryForgetResponse> {
    if (!body.id) return reject("id is required for memories.forget")
    const agentId = this.cache.getAgentIdForPassage(body.id)
    if (!agentId) return reject(`Unknown passage: ${body.id}`)
    return this.letta.agents.passages
      .delete(body.id, { agent_id: agentId })
      .then(() => ({ id: body.id!, forgotten: true })) as APIPromise<MemoryForgetResponse>
  }

  updateMemory(body: MemoryUpdateMemoryParams, _opts?: RequestOptions): APIPromise<MemoryUpdateMemoryResponse> {
    return this.cache.resolveAgentId(body.containerTag).then((agentId) =>
      this.letta.agents.blocks.list(agentId, {}).then((page) => {
        const blocks: Array<{ id: string; label?: string | null; value: string }> =
          (page as { data?: Array<{ id: string; label?: string | null; value: string }> }).data ?? []
        const target = blocks.find((b) => b.label === "human") ?? blocks[0]
        if (!target) throw new Error("No blocks found on agent — cannot update memory")
        return this.letta.agents.blocks
          .update(target.label ?? target.id, { agent_id: agentId, value: body.newContent })
          .then((result) => ({
            id: result.id,
            createdAt: new Date().toISOString(),
            forgetAfter: null,
            forgetReason: null,
            memory: body.newContent,
            parentMemoryId: null,
            rootMemoryId: null,
            version: 1,
          }))
      }),
    ) as APIPromise<MemoryUpdateMemoryResponse>
  }
}

export class LettaMemoryClient {
  readonly documents: LettaDocumentsAdapter
  readonly search: LettaSearchAdapter
  readonly memories: LettaMemoriesAdapter

  private readonly cache: AgentCache
  private readonly letta: Letta

  constructor(options: LettaMemoryClientOptions) {
    this.letta = new Letta({ baseURL: options.baseUrl, apiKey: options.apiKey })
    this.cache = new AgentCache(this.letta, options.model)
    this.documents = new LettaDocumentsAdapter(this, this.cache, this.letta)
    this.search = new LettaSearchAdapter(this.cache, this.letta)
    this.memories = new LettaMemoriesAdapter(this.cache, this.letta)
  }

  add(body: AddParams, _opts?: RequestOptions): APIPromise<AddResponse> {
    const tag = body.containerTag ?? body.containerTags?.[0] ?? "default"
    return wrap(
      this.cache.resolveAgentId(tag).then((agentId) =>
        this.letta.agents.passages.create(agentId, { text: body.content, tags: [tag] }).then((result) => {
          const passage = result[0]!
          this.cache.recordPassage(passage.id!, agentId)
          return { id: passage.id!, status: "queued" } as AddResponse
        }),
      ),
    )
  }

  profile(body: ProfileParams, _opts?: RequestOptions): APIPromise<ProfileResponse> {
    return wrap(
      this.cache.resolveAgentId(body.containerTag).then((agentId) =>
        this.letta.agents.blocks.list(agentId, {}).then((page) => {
          const blocks: Array<{ label?: string | null; value: string }> =
            (page as { data?: Array<{ label?: string | null; value: string }> }).data ?? []
          const entries = blocks.map((b) => `${b.label ?? "block"}: ${b.value}`)
          return { profile: { dynamic: entries, static: [] } } as ProfileResponse
        }),
      ),
    )
  }
}
