import type { LettaHttpClient } from "./http-client.js"

export class AgentCache {
  private tagToAgentId = new Map<string, string>()
  private passageToAgentId = new Map<string, string>()
  private pendingAgents = new Map<string, Promise<string>>()

  constructor(private http: LettaHttpClient) {}

  async resolveAgentId(containerTag: string): Promise<string> {
    const cached = this.tagToAgentId.get(containerTag)
    if (cached !== undefined) return cached

    const pending = this.pendingAgents.get(containerTag)
    if (pending !== undefined) return pending

    const agentP = this.http
      .post<{ id: string }>("/v1/agents", { name: containerTag })
      .then((agent) => {
        this.tagToAgentId.set(containerTag, agent.id)
        this.pendingAgents.delete(containerTag)
        return agent.id
      })
      .catch((err) => {
        this.pendingAgents.delete(containerTag)
        throw err
      })

    this.pendingAgents.set(containerTag, agentP)
    return agentP
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
