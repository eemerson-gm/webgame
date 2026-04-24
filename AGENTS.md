# Agent context — webgame (Excalibird)

This file summarizes the app for AI assistants and contributors: stack, layout, conventions, and how pieces fit together.

## Goal when writing code

The **ultimate goal is readability**: someone reading the file should understand **what happens and why** with minimal effort. Prefer **clear names**, **small focused functions**, and **straightforward control flow** over cleverness. Where you can, shape code so it **reads like a sentence**: verb-like function names (`connectToServer`, `mergePlayerState`), subject–verb–object ordering, and steps in **top-to-bottom** order that match how you would describe the behavior aloud. The **Code constraints** section exists to keep style consistent and to push meaning into the code itself (for example, no comments means names and structure must do the explaining).

## Agent workflow (required)

- **Do not run `npm run build`** (or any Vite production build) after making changes unless the user explicitly asks for a build.
- **Do not start the game** — do not run `npm run dev`, `npm run start`, `npm run serve`, or otherwise launch the dev server, preview server, or open the game in a browser unless the user explicitly asks.

## Code constraints (required)

- **No comments** — do not add `//`, `/* */`, or JSDoc in source; keep code self-explanatory.
- **No `let`** — use `const` only; restructure with smaller scopes or helpers when a value would be reassigned.
- **No `for` loops** — no `for`, `for...of`, or `for...in`; use `.forEach` / `.map` / `.filter` / `.reduce`, `while`, or recursion instead.
- **No `else`** — use early `return`, guard clauses, or ternary expressions instead of `else` / `else if`.
- **No `switch`** — use object maps, chained `if`s with early returns, or separate functions per case.

## What it is

A small **multiplayer pixel platformer**: the browser runs an **Excalibur** game (Vite + TypeScript), and a **Node** server provides HTTP (static build) plus **WebSockets** for player sync. The HTML title is **Excalibird**.

## Tech stack

| Area | Choice |
|------|--------|
| Language | TypeScript (no `tsconfig.json` in repo yet; Vite/TS still resolve) |
| Client bundler | Vite 7 |
| Game engine | Excalibur 0.30.x |
| HTTP server | Express 5 |
| Real-time | `ws` (WebSocket server on the same HTTP server instance) |
| Run TS on server | `tsx` (dev: `nodemon --exec tsx`) |
| Utilities | `lodash` (`merge`, `clamp`, …), `uuid` (available; prefer consistency with existing IDs) |

## NPM scripts

- **`npm run dev`** — `concurrently`: Vite dev server + nodemon restarting `src/server.ts`.
- **`npm run start`** — production-style: `tsx src/server.ts` (serves `dist`; build the client first).
- **`npm run build`** — `vite build` → `dist/`.
- **`npm run serve`** — `vite preview` (client preview only).

## Repository layout

```
src/
  main.ts           # Excalibur bootstrap, tilemap, GameClient wiring, remote player handlers
  server.ts         # Express static + listen; constructs GameServer
  resource.ts       # Excalibur ImageSource map (`Resources`)
  actors/Player.ts  # Local/remote player Actor (physics, input, network sends)
  classes/
    GameClient.ts   # Browser WebSocket client + message types (`Data`, `Message`, …)
    GameServer.ts   # ws WebSocketServer + routing/broadcast
assets/             # Referenced from `resource.ts` (e.g. player.png, block.png)
index.html          # Entry: `./src/main.ts`
eslint.config.mts   # ESLint 9 flat config
```

## Architecture (mental model)

1. **`server.ts`** creates Express, serves **`dist`**, listens on **port 8080**, passes the `http.Server` to **`GameServer`**.
2. **`GameServer`** attaches **`ws`**, keeps **`playerSockets`** and **`playersData`**, parses JSON from the wire, merges `_d` into that player’s **`playersData`** entry with **`lodash/merge`**, and dispatches using **`listen(messages)`** (`MessageRouting`: each event name → **`"player"`** or **`"others"`**).
3. **`GameClient`** (browser) opens a WebSocket to **`ws(s)://host[:8080]/game`** on localhost vs production hostname rules in code. Outbound shape: `{ _t, _p, _d? }`; inbound: `{ _t, _p }`. Built-in pseudo-events **`_connected`** / **`_disconnected`** are merged in `listen()`.
4. **`main.ts`** starts the engine, loads **`Resources`**, builds a tilemap, instantiates **`GameClient`**, and on connect spawns the local **`Player`** and reconciles existing **`playersData`**.

When changing networking, keep **client `send` / `listen` payloads** and **server `listen(messages)` keys** in sync.

## Wire protocol (convention)

- **`_t`**: string message type (e.g. `create_player`, `update_player`, `_connected`).
- **`_p`**: payload object (often includes `id` on the server after merge).
- **`_d`**: optional extra client→server fields merged into stored player state on the server.

Server adds **`id`** to payloads where relevant before forwarding.

## Coding style to match

Observed patterns in this repo—prefer these unless you are deliberately modernizing:

- **Quotes & semicolons**: double-quoted strings; statements end with semicolons.
- **Imports**: `import * as ex from "excalibur"`; default import for `express`; named imports from `ws`, `lodash`, local modules.
- **Types**: `Data` as `Record<string, any>` in `GameClient.ts`; ESLint is configured with **`@typescript-eslint/no-explicit-any`: off** in `eslint.config.mts`.
- **Classes**: `GameClient`, `GameServer`, `Player extends ex.Actor` with **`override`** on lifecycle hooks where applicable.
- **Visibility**: `public` / `private` on members; optional `client?: GameClient` on `Player` for non-local instances.
- **Naming**: camelCase for variables/methods; message types and some payload keys use **snake_case** strings (`create_player`, `update_player`) and short keys in payloads (`kl`, `kr`, `kj`, `sh`, `sv`)—keep new network fields consistent with that scheme or document a migration.
- **Names describe meaning, not mechanism**: prefer what a value *represents* in the product (`playerSockets`, `playersData`, `payloadWithPlayerId`) over how it appears in code (`Record`, `RawData`, `temp`, `obj`) unless you are naming the wire format itself. Use names that match what players and messages are in plain language, not abstract DDD jargon unless it genuinely reads better.
- **Logging**: `console.log` / `console.error` with short prefixes (`[WS]`, `[HTTP]`, `[id]:`) where useful.

## Linting

- **ESLint 9** flat config in **`eslint.config.mts`**: `@eslint/js` recommended, **`typescript-eslint` recommended**, globals for **browser + node**.
- Run ESLint via your editor or `npx eslint .` if you add an npm script later.

## Assets & game feel

- **Pixel art**: engine uses `pixelArt: true`, `antialiasing: false`, small logical resolution (**320×180**), **16×16** tiles and player size.
- New sprites: add **`ex.ImageSource`** entries in **`resource.ts`** and load through **`DefaultLoader`** in **`main.ts`**.
