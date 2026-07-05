import { describe, expect, it } from "vitest"
import { createLettaMemoryClient } from "../src/index.ts"

describe("memsdk-letta exports", () => {
  it("exposes an explicit Letta factory stub", () => {
    expect(() => createLettaMemoryClient({ lettaClient: {} })).toThrow(
      "createLettaMemoryClient is not implemented yet",
    )
  })
})
