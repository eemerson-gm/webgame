# Architecture rationale

Patterns for how this project is built. Follow [AGENTS.md](../AGENTS.md) checklists first; use this when choosing between two valid approaches.

## Layered entity inheritance

Each level in the chain owns one concern. Concrete entities (player, enemy, prop) extend the shallowest base that already provides what they need.

- Lower layers: lifecycle, transform, graphics, collision, velocity, separation.
- Middle layers: locomotion mode (e.g. grounded walk/jump, fixed timestep).
- Top layers: input, networking, AI, combat—only what that entity needs.

Put behavior on the base that already owns that data. Systems that serve many entity kinds accept the shared base type and call overridable hooks instead of branching on entity kind.

Add a new abstract layer only when **multiple siblings** need the same middle concern. Prefer subclassing and overriding over new standalone types or utility modules.

## Thin entrypoints and phase-owned state

Entry code constructs one application object (or server listener) and delegates. Wiring, constants, and lifecycle belong in classes.

Data that belongs together in a gameplay phase (players in a room, terrain, timers) lives on **one instance** created when that phase starts—not on module-level bags any file can mutate.

Engine setup, pre-game UI, and active play are different lifecycles. Mixing them in one file makes changes harder to localize.

When a file accumulates unrelated jobs (DOM, socket callbacks, per-frame systems, spawning), extract types that own each slice. Prefer a coordinator plus collaborators over a monolith.

Handlers registered at startup but reacting to state that appears later must **delegate to an owner field** at event time, not capture stale state when registered.

Split oversized types by lifecycle or system (e.g. separation vs combat) using more classes or collaborators—not helper file dumps. Extract when the boundary is obvious.

## Network layer

Wire shapes live in one place: [`GameWire`](../src/classes/GameWire.ts) (Zod discriminated unions + a small class for encode/parse/relay helpers). Types are inferred from those unions; do not add parallel hand-written payload interfaces.

- **`GameClient`**: WebSocket, `send(ClientSend)`, lobby callbacks, `setWorldHandlers` for in-world messages.
- **`GameServer`**: rooms, sockets, terrain; uses `GameWire` and `relayRules` for parse/relay.
- **`ClientWorldSession`**: registers world handlers once when play starts.

**Outbound** means client → server. **Inbound** means server → client (what handlers see after relay).

## Helpers and reuse

Reuse via inheritance or composition on the owning type. Do not introduce new files whose primary content is unrelated free functions. If two domains truly share logic, prefer a small reusable class over a `*Utils` module.
