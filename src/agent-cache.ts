import type Letta from "@letta-ai/letta-client"

export class AgentCache {
  private tagToAgentId = new Map<string, string>()
  private passageToAgentId = new Map<string, string>()
  private pendingAgents = new Map<string, Promise<string>>()
  private folderId: string | null = null

  constructor(
    private readonly letta: Letta,
    private readonly model?: string,
  ) {}

  async resolveAgentId(containerTag: string): Promise<string> {
    const cached = this.tagToAgentId.get(containerTag)
    if (cached !== undefined) return cached

    const pending = this.pendingAgents.get(containerTag)
    if (pending !== undefined) return pending

    const agentP = this.letta.agents
      .create({ name: containerTag, ...(this.model ? { model: this.model } : {}) })
      .then((agent) => {
        this.tagToAgentId.set(containerTag, agent.id!)
        this.pendingAgents.delete(containerTag)
        return agent.id!
      })
      .catch((err) => {
        this.pendingAgents.delete(containerTag)
        throw err
      })

    this.pendingAgents.set(containerTag, agentP)
    return agentP
  }

  async resolveFolderId(): Promise<string> {
    if (this.folderId !== null) return this.folderId
    const folder = await this.letta.folders.create({ name: "memsdk-uploads" })
    this.folderId = folder.id!
    return this.folderId
  }

  recordPassage(passageId: string, agentId: string): void {
    this.passageToAgentId.set(passageId, agentId)
  }

  getAgentIdForPassage(passageId: string): string | undefined {
    return this.passageToAgentId.get(passageId)
  }

  getTagForAgentId(agentId: string): string | undefined {
    for (const [tag, id] of this.tagToAgentId) {
      if (id === agentId) return tag
    }
    return undefined
  }
}
