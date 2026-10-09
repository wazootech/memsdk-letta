import type Letta from "@letta-ai/letta-client"

export class AgentCache {
  private namespaceToAgentId = new Map<string, string>()
  private passageToAgentId = new Map<string, string>()
  private documentToPassageId = new Map<string, string>()
  private pendingAgents = new Map<string, Promise<string>>()
  private folderId: string | null = null

  constructor(
    private readonly letta: Letta,
    private readonly model?: string,
  ) {}

  async resolveAgentId(namespace: string): Promise<string> {
    const cached = this.namespaceToAgentId.get(namespace)
    if (cached !== undefined) return cached

    const pending = this.pendingAgents.get(namespace)
    if (pending !== undefined) return pending

    const agentP = this.letta.agents
      .create({ name: namespace, ...(this.model ? { model: this.model } : {}) })
      .then((agent) => {
        this.namespaceToAgentId.set(namespace, agent.id!)
        this.pendingAgents.delete(namespace)
        return agent.id!
      })
      .catch((err) => {
        this.pendingAgents.delete(namespace)
        throw err
      })

    this.pendingAgents.set(namespace, agentP)
    return agentP
  }

  async resolveFolderId(): Promise<string> {
    if (this.folderId !== null) return this.folderId
    const folder = await this.letta.folders.create({
      name: "memsdk-uploads",
      embedding_config: {
        embedding_dim: 768,
        embedding_endpoint_type: "ollama",
        embedding_model: "nomic-embed-text",
        embedding_endpoint: "http://host.docker.internal:11434/v1",
        handle: "ollama/nomic-embed-text",
      },
    })
    this.folderId = folder.id!
    return this.folderId
  }

  recordPassage(passageId: string, agentId: string): void {
    this.passageToAgentId.set(passageId, agentId)
  }

  getAgentIdForPassage(passageId: string): string | undefined {
    return this.passageToAgentId.get(passageId)
  }

  /**
   * Letta passages are immutable, so a v5 document ID (caller-defined, or the first
   * passage ID) stays stable while the backing passage is replaced on update.
   */
  bindDocument(documentId: string, passageId: string): void {
    if (documentId === passageId) this.documentToPassageId.delete(documentId)
    else this.documentToPassageId.set(documentId, passageId)
  }

  unbindDocument(documentId: string): void {
    this.documentToPassageId.delete(documentId)
  }

  passageIdFor(documentId: string): string {
    return this.documentToPassageId.get(documentId) ?? documentId
  }

  documentIdFor(passageId: string): string {
    for (const [documentId, id] of this.documentToPassageId) {
      if (id === passageId) return documentId
    }
    return passageId
  }
}
