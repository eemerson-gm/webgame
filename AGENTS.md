# Agent context — webgame (Excalibird)

## What it is

Excalibird is a small **multiplayer pixel platformer**: an **Excalibur** client with a **Node** server for sync.

## Architecture principle — client-authoritative physics

Physics is always simulated by the client. A client "owns" an entity and periodically corrects others by sending position/velocity data to the server, which relays it to peers. The server never runs physics itself — it is a relay and validator.

## Environment and workflow

- This repo is developed on a **Windows operating system**.
- **Do not run `npm run build`** or any Vite production build unless the user explicitly asks.
- **Do not run `tsc`** or TypeScript no-emit checks unless the user explicitly asks.
- **Do not start the game** unless the user explicitly asks.
- **Do not review your own changes after editing** unless the user explicitly asks for a review.
- Avoid running `git diff` or `git status` after edits unless you explicitly ask.
- When you need sprite dimensions, always run `npm run sprite:dimensions -- <sprite-path>` instead of guessing.

## MCPs

- Use the Excalibur MCP when unsure about Excalibur APIs, engine behavior, or recommended patterns.
- Excalibur MCP commands: `excaliburjs_list_doc_pages`, `excaliburjs_search_doc_pages`, `excaliburjs_get_doc_source`.
- For a quick list of possible Excalibur objects to use, read `.cursor/skills/excalibur-objects/SKILL.md`.

## Code constraints

- **No comments**: do not add `//`, `/* */`, or JSDoc in source. Make names and structure carry the meaning.
- Do not assign to Excalibur `Actor.width` or `Actor.height` after construction; they are read-only getters. Size actors through constructor options or replace/update their graphics instead.
- **No `let`**: use `const` and restructure with smaller scopes or helpers when a value would be reassigned.
- **No `for` loops**: no `for`, `for...of`, or `for...in`; use `.forEach`, `.map`, `.filter`, `.reduce`, `while`, or recursion.
- **No `else`**: use early `return`, guard clauses, or ternaries.
- **No `switch`**: use object maps, chained `if`s with early returns, or separate functions per case.

## Readability

- The goal of writing code is readability: someone should understand what happens and why with minimal effort.
- Prefer clear names, small focused functions, and straightforward top-to-bottom control flow.
- Prefer consulting `.cursor/skills/*/SKILL.md` when picking helpers or patterns (for example, lodash and Excalibur guidance).
- When transforming collections, lodash helpers like `map`, `filter`, `reduce`, `groupBy`, `sortBy`, `pick`, `omit`, and `uniq` are acceptable for readability.
- Shape code so it reads like a sentence, with verb-like function names and names that describe product meaning instead of mechanics.
- Shared behavior belongs in the parent class. Do not duplicate code in a new child class when the parent can own it.

## Game feel

- Keep the pixel-art setup.
- **Never turn on `snapToPixel`**; keep Excalibur `snapToPixel: false`.
- For player movement jitter, prefer fixed-step physics with render interpolation. Physics/collision should advance on a stable tick such as 60 Hz, while the sprite/graphics offset interpolates between the previous and current physics positions using the leftover accumulator time. This fixes temporal aliasing between browser repaint timing and physics ticks without tying movement back to framerate.

## Code structure patterns

- **Actors are thin orchestration layers**: they hold state (like grounded/jumping), call into shared base classes for collision/movement, and delegate entity-physics to simulation helpers.
- **Collision + kinematics are separated**:
  - `src/simulation/entityPhysics.ts` contains pure stepping/collision helpers.
  - `src/actors/TileCollisionActor.ts` provides tile collision queries to Excalibur actors.
  - `src/actors/MovingActor.ts` converts `hspeed/vspeed` into stepping calls and applies the resulting physics state back onto the actor.
- **Game loop uses explicit phases**:
  - fixed-step update (often inside a dedicated `step...` method)
  - then render interpolation update (e.g. applying a render offset based on the accumulator progress)
- **Movement logic is factored into “verb” methods**: keep tuning and branching readable by expressing behavior as small functions (for example: ground movement, air movement, knockback).
- **Networking is split by concern**:
  - `GameProtocol` defines message types and payload shapes plus `encodeMessage/decodeMessage`
  - `GameClient` wires WebSocket connect/receive and dispatches inbound messages to handlers
  - `GameServer` owns world/room state, message routing, and server-side validation for world-changing actions
- **Entity simulation is routed by type**:
  - `src/simulation/entitySimulation.ts` iterates entities and calls a type-specific step function
  - concrete behavior lives in `src/simulation/*EntityBehavior.ts` per entity type.

## Polymorphic + readable code (how to write it)

- Model differences with **polymorphism**, not big “if/else on type” blocks.
  - Put varying behavior behind a method/strategy and let callers stay generic.
- Keep base classes **small and intention-revealing**:
  - shared invariants go in the parent
  - extension points become overridable methods that do one thing
- Make overrides **narrow in scope**:
  - an overridden method should only change the behavior that truly varies
  - don’t re-implement unrelated logic in children
- Prefer **composition / strategy objects** when behavior changes independently of object identity.
- Use interfaces/types to state **contracts**:
  - callers depend on what something can do, not what it “is”
  - ensure implementations are substitutable (Liskov-style thinking)
- Avoid “flag explosion”:
  - if behavior branches on many booleans, extract that branching into polymorphic methods or separate strategy instances
- Keep functions readable:
  - use short, verb-like method names
  - write guard clauses early and return immediately
  - keep each function focused on one phase/concern
- Make data flow obvious:
  - avoid hidden mutation across layers
  - prefer transforming inputs to outputs rather than scattering side-effects

