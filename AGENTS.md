# Agent Information

## Commands

- Use `npm run sprite:dimensions -- <sprite-path>` to get the dimensions of a sprite.
- Use `npm run sprite:list` to get all the available sprites in the `public/assets/` folder.
- Use `npm run search -- <pattern> [path]` to search file contents (defaults to `src/`). Use `/pattern/flags` for regex.
- Use `npm run typecheck` to run TypeScript with no emit.

## Environment and workflow

- This repo is developed on a **Windows operating system**.
- **Do not use `&&`** when chaining commands, it will not work on **Windows** use `;` to seperate commands.
- **Do not run `rg`** it will not work, and is not a command.
- **Do not run `npm run build`** or any Vite production build unless the user explicitly asks.
- **Do not start the game** unless the user explicitly asks.
- **Do not review your own changes after editing** unless the user explicitly asks for a review.
- **Do not run** `git diff` or `git status`.
- Always run `npm run lint` after making changes to files and fix all the errors. Ignore errors on other files.

## MCPs

- **Always** use the Excalibur MCP when necessary: `excaliburjs_list_doc_pages`, `excaliburjs_search_doc_pages`, `excaliburjs_get_doc_source`.

## Code constraints

- No comments.
- Never use the keywords `else`, `switch`, `for`, `function`, `any`, `uknown`.
- Never do inline `import` or `require`, imports should be at top of the file.
- Only use `let` when necessary, otherwise use `const`.
- Functions should always be defined with `const`.
- Types should always be explicit and clear, if they are not your structure is wrong.
- Classes should always be abstracted if they can be reused.
- Code should be object oriented, using inheritance, and polymorphic design.
- Reusable code should be abstracted.

## Polymorphic design and inheritance

Model gameplay entities as a **layered inheritance chain** so each level owns one concern and subclasses only add what is specific to them. Follow the patterns already in `src/actors/`:

- `ex.Actor` — Excalibur actor lifecycle, transform, graphics host
- `MovingActor` — tile collision, velocity integration, separation bodies, shared physics state
- `WalkingActor` — grounded locomotion, jump/gravity stepping, fixed-timestep hooks
- `Player` / `Slime` — input, networking, combat, or AI on top of walking

**Why this way**

- **Behavior lives at the right level**: collision and movement math belong on `MovingActor`; walk/jump tuning on `WalkingActor`; only `Player` should know about keys or `PlayerNetworkClient`.
- **Polymorphism over branching**: systems (separation, combat, remote sync) can accept `MovingActor` or `WalkingActor` and call overridden hooks (`onWalkingLand`, `syncLocomotionVisuals`) instead of `if (player) … else if (slime) …`.
- **Less duplication**: two walking entities share one implementation; fixes to gravity or collision apply everywhere.
- **Clear extension point**: new entity types extend the shallowest base that already provides what they need, then override protected methods rather than copying helpers.

When adding behavior, prefer **subclassing and overriding** over new standalone types or utility modules. Introduce a new abstract base in the chain only when multiple siblings need the same layer (e.g. a future `FlyingActor extends MovingActor`).

## Helpers and free functions

- **Do not add new files whose main purpose is helper or utility functions.** Logic should live on the class that owns the data and lifecycle.
- **Avoid module-level helper functions** in general; implement `private` / `protected` methods on the relevant class (or a small collaborator class constructed by that type, e.g. `PlayerVisuals`, `PlayerNetworkClient`).
- If logic is shared across unrelated domains, prefer a **reusable class** (composition) over a loose function file—not a `*Utils.ts` or `*Helpers.ts` dump.
- Existing top-level exports in actor modules (e.g. collision helpers used at construction time) are legacy exceptions; do not copy that pattern for new features.