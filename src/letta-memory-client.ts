import Letta, { type Uploadable as LettaUploadable } from "@letta-ai/letta-client"
import type {
  AddParams,
  AddResponse,
  APIPromise,
  ChunkRecord,
  DocumentBatchAddParams,
  DocumentBatchAddResponse,
  DocumentDeleteParams,
  DocumentDeleteResponse,
  DocumentFileResponse,
  DocumentGetParams,
  DocumentGetResponse,
  DocumentInclude,
  DocumentUpdateParams,
  DocumentUpdateResponse,
  DocumentUploadFileParams,
  ListDocument,
  ListParams,
  ListResponse,
  ListType,
  MemoryForgetMatchingParams,
  MemoryForgetParams,
  MemoryForgetResponse,
  MemoryGetParams,
  MemoryGetResponse,
  MemoryRecord,
  ProfileParams,
  ProfileResponse,
  RequestOptions,
  SearchParams,
  SearchResponse,
  SearchResult,
  SupermemoryInterface,
  Uploadable,
  UploadableFileLike,
} from "memsdk"
import { AgentCache } from "./agent-cache.js"

export interface LettaMemoryClientOptions {
  baseUrl: string
  apiKey: string
  model?: string
}

interface LettaPassage {
  id?: string
  text: string
  created_at?: string | null
  updated_at?: string | null
}

function wrap<T>(p: Promise<T>): APIPromise<T> {
  return p as APIPromise<T>
}

function reject<T>(msg: string): APIPromise<T> {
  return Promise.reject(new Error(msg)) as APIPromise<T>
}

function timestamps(passage: LettaPassage) {
  const createdAt = passage.created_at ?? new Date().toISOString()
  return { createdAt, updatedAt: passage.updated_at ?? createdAt }
}

function includes<T extends string>(include: T | Array<T> | undefined, value: T) {
  return include === value || (Array.isArray(include) && include.includes(value))
}

function paginate<T>(items: Array<T>, page = 1, limit = 10) {
  return {
    items: items.slice((page - 1) * limit, page * limit),
    pagination: {
      currentPage: page,
      limit,
      totalItems: items.length,
      totalPages: Math.ceil(items.length / limit),
    },
  }
}

async function fileLikeToLetta(
  file: UploadableFileLike,
  filename = "upload.bin",
): Promise<LettaUploadable> {
  if (file instanceof File) return file
  if (file instanceof Blob) return new File([file], filename)
  if (file instanceof ReadableStream) {
    return new File([await new Response(file).blob()], filename)
  }
  return new File([file as BlobPart], filename)
}

async function uploadableToLetta(file: Uploadable): Promise<LettaUploadable> {
  if (typeof file === "object" && file !== null && "data" in file) {
    return fileLikeToLetta(file.data, file.filename)
  }
  if (typeof file === "object" && file !== null && "path" in file) {
    throw new Error("Path uploads are not supported by the Letta adapter")
  }
  return fileLikeToLetta(file)
}

export class LettaMemoryClient {
  readonly documents: LettaDocumentsAdapter
  readonly memories: LettaMemoriesAdapter

  private readonly cache: AgentCache
  private readonly letta: Letta

  constructor(options: LettaMemoryClientOptions) {
    this.letta = new Letta({ baseURL: options.baseUrl, apiKey: options.apiKey })
    this.cache = new AgentCache(this.letta, options.model)
    this.documents = new LettaDocumentsAdapter(this, this.cache, this.letta)
    this.memories = new LettaMemoriesAdapter(this, this.cache, this.letta)
  }

  add(
    namespace: string,
    request: AddParams,
    _opts?: RequestOptions,
  ): APIPromise<AddResponse> {
    return wrap(
      this.createPassage(namespace, request.content).then((passageId) => {
        const id = request.id ?? passageId
        this.cache.bindDocument(id, passageId)
        return { id, status: "queued" } satisfies AddResponse
      }),
    )
  }

  search(
    namespace: string,
    request: SearchParams,
    _opts?: RequestOptions,
  ): APIPromise<SearchResponse> {
    const started = performance.now()
    return wrap(
      this.cache.resolveAgentId(namespace).then((agentId) =>
        this.letta.agents.passages
          .search(agentId, { query: request.query, top_k: request.limit ?? 10 })
          .then((result) => {
            const results = result.results.map((r): SearchResult => {
              // Letta returns `score` and `metadata` at runtime without declaring them.
              const extra = r as { score?: number; metadata?: Record<string, unknown> }
              const text =
                request.searchMode === "chunks"
                  ? { chunk: r.content }
                  : { memory: r.content }
              return {
                id: this.cache.documentIdFor(r.id),
                ...text,
                metadata: extra.metadata ?? {},
                similarity: extra.score ?? 0,
                isLatest: true,
                isInference: false,
                system: { updatedAt: r.timestamp },
              }
            })
            return { results, searchTime: performance.now() - started }
          }),
      ),
    )
  }

  profile(
    namespace: string,
    _request?: ProfileParams,
    _opts?: RequestOptions,
  ): APIPromise<ProfileResponse> {
    return wrap(
      this.cache.resolveAgentId(namespace).then((agentId) =>
        this.letta.agents.blocks.list(agentId, {}).then((page) => {
          const blocks: Array<{ id: string; label?: string | null; value: string }> =
            (
              page as {
                data?: Array<{ id: string; label?: string | null; value: string }>
              }
            ).data ?? []
          const dynamic = blocks.map((b) => ({
            id: b.id,
            memory: `${b.label ?? "block"}: ${b.value}`,
          }))
          return { profile: { static: [], dynamic, buckets: {} } }
        }),
      ),
    )
  }

  profileMarkdown(
    namespace: string,
    request?: ProfileParams,
    opts?: RequestOptions,
  ): Promise<string> {
    return this.profile(namespace, request, opts).then(({ profile }) => {
      const section = (title: string, items: Array<{ memory: string }>) =>
        `## ${title}\n\n${items.length ? items.map((i) => `- ${i.memory}`).join("\n") : "_None_"}\n`
      return [
        `# Profile: ${namespace}\n`,
        section("Static", profile.static),
        section("Dynamic", profile.dynamic),
      ].join("\n")
    })
  }

  list(
    namespace: string,
    type: ListType,
    request?: ListParams,
    _opts?: RequestOptions,
  ): APIPromise<ListResponse> {
    return wrap(
      this.listPassages(namespace).then((passages) => {
        const { items, pagination } = paginate(passages, request?.page, request?.limit)
        return {
          documents:
            type === "documents" ? items.map((p) => this.toListDocument(p)) : [],
          chunks:
            type === "chunks"
              ? items.map((p) => ({
                  ...this.toChunk(p),
                  documentId: this.documentIdOf(p),
                }))
              : [],
          memories: type === "memories" ? items.map((p) => this.toMemory(p)) : [],
          pagination,
        }
      }),
    )
  }

  /** @internal */
  createPassage(namespace: string, text: string): Promise<string> {
    return this.cache.resolveAgentId(namespace).then((agentId) =>
      this.letta.agents.passages
        .create(agentId, { text, tags: [namespace] })
        .then((result) => {
          const passage = result[0]
          if (!passage?.id) throw new Error("Server returned a passage without an id")
          this.cache.recordPassage(passage.id, agentId)
          return passage.id
        }),
    )
  }

  /** @internal */
  listPassages(namespace: string): Promise<Array<LettaPassage>> {
    return this.cache
      .resolveAgentId(namespace)
      .then((agentId) => this.letta.agents.passages.list(agentId, {}))
  }

  /** @internal Resolves a document ID to its current backing passage. */
  findPassage(namespace: string, documentId: string): Promise<LettaPassage> {
    const passageId = this.cache.passageIdFor(documentId)
    return this.listPassages(namespace).then((passages) => {
      const passage = passages.find((p) => p.id === passageId)
      if (!passage) throw new Error(`Document not found: ${documentId}`)
      return passage
    })
  }

  /** @internal */
  deletePassage(namespace: string, passageId: string): Promise<void> {
    return this.cache.resolveAgentId(namespace).then((agentId) =>
      this.letta.agents.passages
        .delete(passageId, {
          agent_id: this.cache.getAgentIdForPassage(passageId) ?? agentId,
        })
        .then(() => undefined),
    )
  }

  /** @internal */
  documentIdOf(passage: LettaPassage): string {
    return this.cache.documentIdFor(passage.id ?? "")
  }

  /** @internal */
  toListDocument(passage: LettaPassage): ListDocument {
    return {
      id: this.documentIdOf(passage),
      title: null,
      type: "text",
      summary: null,
      metadata: {},
      url: null,
      system: { ...timestamps(passage), status: "done" },
    }
  }

  /** @internal */
  toChunk(passage: LettaPassage): ChunkRecord {
    return {
      id: passage.id ?? "",
      position: 0,
      content: passage.text,
      type: "text",
      metadata: {},
      system: { createdAt: timestamps(passage).createdAt },
    }
  }

  /** @internal */
  toMemory(passage: LettaPassage): MemoryRecord {
    return {
      id: this.documentIdOf(passage),
      memory: passage.text,
      metadata: {},
      isStatic: false,
      isInference: false,
      isLatest: true,
      isForgotten: false,
      version: 1,
      system: timestamps(passage),
    }
  }
}

class LettaDocumentsAdapter {
  constructor(
    private readonly client: LettaMemoryClient,
    private readonly cache: AgentCache,
    private readonly letta: Letta,
  ) {}

  get(
    namespace: string,
    id: string,
    request?: DocumentGetParams,
    _opts?: RequestOptions,
  ): APIPromise<DocumentGetResponse> {
    const include = request?.include as
      DocumentInclude | Array<DocumentInclude> | undefined
    return wrap(
      this.client.findPassage(namespace, id).then((passage) => ({
        id,
        title: null,
        type: "text",
        summary: null,
        content: passage.text,
        metadata: {},
        system: { ...timestamps(passage), status: "done" as const },
        ...(includes(include, "chunks")
          ? { chunks: [this.client.toChunk(passage)] }
          : {}),
        ...(includes(include, "memories")
          ? { memories: [{ ...this.client.toMemory(passage), id }] }
          : {}),
      })),
    )
  }

  update(
    namespace: string,
    id: string,
    request?: DocumentUpdateParams,
    _opts?: RequestOptions,
  ): APIPromise<DocumentUpdateResponse> {
    const content = request?.content
    if (content === undefined) {
      return wrap(
        this.client.findPassage(namespace, id).then(() => ({ id, status: "done" })),
      )
    }
    // Letta passages are immutable: replace the backing passage, keep the document ID.
    return wrap(
      this.client
        .findPassage(namespace, id)
        .then((old) =>
          this.client
            .createPassage(namespace, content)
            .then((passageId) =>
              this.client.deletePassage(namespace, old.id!).then(() => passageId),
            ),
        )
        .then((passageId) => {
          this.cache.bindDocument(id, passageId)
          return { id, status: "queued" as const }
        }),
    )
  }

  delete(
    namespace: string,
    request: DocumentDeleteParams,
    _opts?: RequestOptions,
  ): APIPromise<DocumentDeleteResponse> {
    return wrap(
      Promise.all(
        request.ids.map((id) =>
          this.client
            .deletePassage(namespace, this.cache.passageIdFor(id))
            .then(() => {
              this.cache.unbindDocument(id)
              return null
            })
            .catch((err: Error) => ({ id, error: err.message })),
        ),
      ).then((results) => {
        const errors = results.filter((r) => r !== null)
        return { count: results.length - errors.length, errors }
      }),
    )
  }

  batchAdd(
    namespace: string,
    request: DocumentBatchAddParams,
    _opts?: RequestOptions,
  ): APIPromise<DocumentBatchAddResponse> {
    return wrap(
      Promise.all(
        request.documents.map((doc) => {
          const params: AddParams = { content: doc.content }
          if (doc.id !== undefined) params.id = doc.id
          return this.client
            .add(namespace, params)
            .then((r) => ({ id: r.id, status: r.status }))
            .catch((err: Error) => ({
              id: doc.id ?? "",
              status: "error" as const,
              error: err.message,
            }))
        }),
      ).then((results) => {
        const failed = results.filter((r) => r.status === "error").length
        return { results, count: results.length - failed, failed }
      }),
    )
  }

  uploadFile(
    _namespace: string,
    request: DocumentUploadFileParams,
    _opts?: RequestOptions,
  ): APIPromise<DocumentFileResponse> {
    return wrap(
      Promise.all([this.cache.resolveFolderId(), uploadableToLetta(request.file)])
        .then(([folderId, file]) => this.letta.folders.files.upload(folderId, { file }))
        .then(
          (result) => ({ id: result.id ?? "file_uploaded", status: "queued" as const }),
          (err: Error) => {
            throw new Error(`File upload failed: ${err.message}`)
          },
        ),
    )
  }
}

class LettaMemoriesAdapter {
  constructor(
    private readonly client: LettaMemoryClient,
    private readonly cache: AgentCache,
    private readonly _letta: Letta,
  ) {}

  get(
    namespace: string,
    id: string,
    _request?: MemoryGetParams,
    _opts?: RequestOptions,
  ): APIPromise<MemoryGetResponse> {
    return wrap(
      this.client
        .findPassage(namespace, id)
        .then((passage) => ({ ...this.client.toMemory(passage), id })),
    )
  }

  forget(
    namespace: string,
    request: MemoryForgetParams,
    _opts?: RequestOptions,
  ): APIPromise<MemoryForgetResponse> {
    return wrap(
      this.client.listPassages(namespace).then((passages) =>
        Promise.all(
          request.ids.map((id) => {
            const passageId = this.cache.passageIdFor(id)
            const passage = passages.find((p) => p.id === passageId)
            if (!passage) return { id, error: `Memory not found: ${id}` }
            return this.client
              .deletePassage(namespace, passageId)
              .then(() => {
                this.cache.unbindDocument(id)
                return { id, memory: passage.text }
              })
              .catch((err: Error) => ({ id, error: err.message }))
          }),
        ).then((results) => {
          const matches = results.filter((r) => "memory" in r)
          const errors = results.filter((r) => "error" in r)
          return { count: matches.length, errors, matches }
        }),
      ),
    )
  }

  /**
   * Not supported: Letta passage search returns top-k results with no relevance
   * threshold, so deleting "what matches" could remove unrelated memories.
   */
  forgetMatching(
    _namespace: string,
    _request: MemoryForgetMatchingParams,
    _opts?: RequestOptions,
  ): APIPromise<MemoryForgetResponse> {
    return reject(
      "memories.forgetMatching is not supported by the Letta adapter; " +
        "search, then call memories.forget with explicit ids",
    )
  }
}

export function createSupermemory(
  options: LettaMemoryClientOptions,
): SupermemoryInterface {
  return new LettaMemoryClient(options)
}
