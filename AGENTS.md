# Agent instructions

## Project Context

You are an expert TypeScript developer working with Node.js runtime and Express.

## Code Style & Structure

### TypeScript Defaults

- Use TypeScript strict mode with `strict: true` in `tsconfig.json` — enables `strictNullChecks`, `noImplicitAny`, and other safety checks.
- Use `const` by default; `let` only when reassignment is needed. Never use `var`.
- Use `interface` for object shapes that may be extended and `type` for unions, intersections, and mapped types.
- Prefer `unknown` over `any` — it forces type narrowing before use and catches bugs at compile time.
- Avoid `any` — use `unknown` with type guards when the type is truly unknown.
- Use discriminated unions for state management over boolean flags.
- Prefer small, focused functions under 30 lines. Extract only when the same non-trivial logic is reused in multiple places, or a single function is genuinely getting long—not to wrap a one-off `if` or a few lines used once.
- Use `readonly` for arrays and properties that should not be mutated.
- Prefer explicit return types on exported functions for documentation and faster type-checking.

### Do not paper over bugs with helpers

When something behaves wrong, fix it at the layer that owns the behavior (collision, physics step order, sync protocol)—do not add a small helper, flag, or post-step patch to mask the symptom.

- **Do not** extract helpers to “clarify” a single condition, dedupe one `if`, or give a workaround a longer name (`notifyLandIf…`, `snapTo…`, `flush…`).
- **Do not** stack state flags on top of a shaky inference (e.g. extra grounded/airborne checks beside tile probes) instead of making land/ground truth come from the collision result.
- **If you want to extract a function**, treat that as a signal the design may be wrong; prefer fixing the underlying flow first.
- **OK to extract:** real extension points (`protected onLand()` overrides), public API, or the same non-trivial block copied in 2+ call sites.

Match existing code: keep logic inline in physics/update steps unless extraction is clearly justified.

### OOP Design Patterns

- Follow SOLID principles for class design.
- Prefer composition over inheritance; use interfaces/protocols for abstraction.
- Encapsulate state within objects; expose behavior through well-defined methods.

## Linting & Formatting

### ESLint

- Use ESLint flat config (`eslint.config.js`). Extend recommended configs for your framework.
- Run `eslint --fix .` for auto-fixable issues. Run `eslint .` in CI without `--fix`.
- Use `typescript-eslint` with `strict` and `stylistic` configs — enable type-checked rules with `parserOptions.project` for deep type analysis.
- Use `@typescript-eslint/recommended` for TypeScript projects. Enable `strict` preset for stricter checks.
- Configure `no-unused-vars`, `no-console`, `prefer-const` as errors — catch real issues, not style nits.

## Express

- Type every route handler with `Request<Params, ResBody, ReqBody, Query>` generics: `router.get<{ id: string }>('/:id', (req, res) => { ... })`.
- Install `@types/express` and use `RequestHandler<P, ResBody, ReqBody>` for typed middleware signatures.
- Create typed error handlers with `ErrorRequestHandler<Params, ResBody, ReqBody>` and chain them with `app.use()` — always type the `err` parameter.
- Define typed error classes extending `Error` with a `statusCode` property and use a centralized error handler typed as `ErrorRequestHandler`.
- Create a generic async wrapper: `const asyncHandler = <P, Res, Req>(fn: RequestHandler<P, Res, Req>): RequestHandler<P, Res, Req> => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)`.
- Use declaration merging to extend Express types: `declare module 'express' { interface Request { user?: User } }` for auth middleware.
- Type response payloads with `res.json()` by setting the `ResBody` generic to ensure API contracts are enforced at compile time.
- Group route files by domain and type each router's param interfaces in a co-located `types.ts`.
- For Node.js: Use `express.Router()` to modularize routes into separate files — mount with `app.use('/api/users', usersRouter)`.
- Always pass errors to `next(err)` — define a centralized error handler as the last middleware: `app.use((err, req, res, next) => {})`.
- Use `express.json()` and `express.urlencoded()` middleware at the top of the stack for automatic body parsing.
- Use `helmet` for HTTP security headers and `cors` for CORS configuration.
- For Node.js: Always pass errors to `next(err)` — never swallow errors or let them crash the process.
- Use a centralized error handler as the last middleware: `app.use((err, req, res, next) => { ... })`.
- Use `express.json()` and `express.urlencoded()` for body parsing. Set size limits.

## Commands

- `npm run sprite:dimensions -- <sprite-path>` — sprite dimensions
- `npm run sprite:list` — list sprites in assets
- `npm run search -- <pattern> [path]` — search file contents (default `src/`); use `/pattern/flags` for regex
- `npm run typecheck` — TypeScript, no emit
- `npm run lint` — ESLint on `src/**/*.ts`

## Environment and workflow

- **Network trace** — `npm run dev` enables aggregated WebSocket in/out rates every 5s (message types and byte totals). No per-packet JSON logging. Override with **`GAME_NETWORK_TRACE=1`** (force on) or **`GAME_NETWORK_TRACE=0`** (force off during dev). Example (PowerShell): `$env:GAME_NETWORK_TRACE="1"; npm run start`
- Developed on **Windows**. Chain shell commands with `;`, not `&&`.
- Search code with **`npm run search` only**. Do not run `rg` (not available here).
- After editing code: run **`npm run lint`** and fix errors in **files you changed** only.
- Run **`npm run typecheck`** when you changed types or imports.
- Do **not** run `npm run build` or any Vite production build unless the user asks.
- Do **not** start or run the game unless the user asks.
- Do **not** review your own diff unless the user asks for a review.
- **Git:** do not run git for casual exploration. When the user asks for a **commit** or **pull request**, follow Cursor user rules for git.
- Follow Cursor user rules for commit messages, PR creation, and push policy.

## Excalibur MCP

Use when editing Excalibur-specific code **before guessing APIs**:

- Actors, scenes, cameras, collision, input
- Graphics, sprites, animations, materials, shaders

Tools: `excaliburjs_list_doc_pages`, `excaliburjs_search_doc_pages`, `excaliburjs_get_doc_source`.

Skip MCP for: DOM-only UI, wire/protocol code, terrain or world-generation math, and plain server routing.

For sprite flash, silhouette, tint, or shader effects on actors: prefer materials on the actor’s existing graphic (not overlay actors that ignore transparency). Follow workspace Excalibur shader rules when they exist.