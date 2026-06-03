# Slime multiplayer sync design

## Goal

Press **R** to spawn a slime at the cursor. All players see the same slime. The **spawner owns** simulation; peers predict from replicated wander intent and correct position on land and interval backup.

## OOP boundaries

| Layer | Responsibility |
|-------|----------------|
| `SlimeNetworkClient` | Outbound `update_entity` / spawn via `create_entity` |
| `Slime` | Random-walk AI (owner), physics, `applyRemoteSimulation` (peers) |
| `ClientWorldEntities` | Spawn map, snapshots, combat → `damage_entity` |
| `ClientWorldSession` | R input, handler wiring |
| `GameServer` | Assign ids, merge `entitiesData`, broadcast `update_entities` |

## Wire (`SlimeEntityState`)

- `type: "slime"`, `ownerId`, `wanderSign`, `facingLeft`, `health`, optional `x`/`y`, one-shot `jump`

## Sync (mirrors players)

Remote position correction uses the same rules as players ([`RemoteNetworkSync.ts`](../../../src/actors/RemoteNetworkSync.ts), [`LivingActor.applySyncedNetworkPosition`](../../../src/actors/LivingActor.ts)): full `x`/`y` when sent, ≤16px desync smooths the sprite, >16px hard teleport.

| When | Owner sends | Peers |
|------|-------------|-------|
| Wander sign change | `wanderSign`, `facingLeft` (+ `x`,`y` if grounded) | Same wander sign; full physics; no local `tryJump` |
| Jump (ledge) | `jump: true` (not stored server-side) | `jump()` once when received; arc from local physics |
| Land | `x`, `y` | Same position correction as players |
| Every 1s | `x`, `y` backup | Same position correction as players |
| Weapon hit | `damage_entity` | Health via snapshot; death → `removedEntityIds` |

Authority slimes ignore peer-style simulation updates except `health` / combat from server.

## Spawn

`create_entity` → server `slime:${n}` → `update_entities` → clients spawn via `ClientWorldEntities` (no optimistic local spawn).

## Out of scope

- Ownership transfer on disconnect
- Server-side physics
