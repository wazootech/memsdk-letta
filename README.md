# memsdk-letta

`memsdk-letta` will implement the `memsdk` Supermemory-compatible memory interface using Letta memory as the backend.

The point of this adapter is to prove that Supermemory-style memory shapes can be implemented by a non-Supermemory backend without introducing a translation-layer API for callers.

## Initial scope

- Establish the adapter package boundary.
- Depend on the review branch for `memsdk` while the core contract is not yet merged or published.
- Define the Letta factory options and exported factory name.

The implementation intentionally throws until the first mapping PR lands.
