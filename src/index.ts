import type { MemoryClient } from "memsdk"

export interface LettaMemoryClientOptions {
  lettaClient: unknown
}

export function createLettaMemoryClient(
  _options: LettaMemoryClientOptions,
): MemoryClient {
  throw new Error("createLettaMemoryClient is not implemented yet")
}
