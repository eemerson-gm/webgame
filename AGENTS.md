# Agent context — webgame (Excalibird)

## What it is

Excalibird is a small **multiplayer pixel platformer**. The browser runs an **Excalibur** game with Vite + TypeScript, and a **Node** server provides HTTP plus **WebSockets** for player sync.

## Environment and workflow

- This project runs on **Windows**.
- **Do not run `npm run build`** or any Vite production build unless the user explicitly asks.
- **Do not start the game** unless the user explicitly asks. This includes `npm run dev`, `npm run start`, `npm run serve`, preview servers, and opening the game in a browser.
- **Do not review your own changes after editing** unless the user explicitly asks for a review.
- If a command is expected to fail because of the workflow above, do not run it just to confirm the failure. Avoid repeating commands that already failed for an environmental reason unless something changed that should fix that reason.

## MCPs

- Use the Excalibur MCP when unsure about Excalibur APIs, engine behavior, or recommended patterns.
- Read an MCP tool's schema or descriptor before calling it.
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
- Shape code so it reads like a sentence, with verb-like function names and names that describe product meaning instead of mechanics.
- Shared behavior belongs in the parent class. Do not duplicate code in a new child class when the parent can own it.

## Networking

- Treat visible gameplay as a client, server, and remote-client design problem.
- Keep client `send` / `listen` payloads and server `listen(messages)` keys in sync.
- Send the minimum packets needed for other clients to see the correct state.
- Use the existing wire shape: `_t` for message type, `_p` for payload, and `_d` for client-to-server state merged into stored player data.

## Game feel

- Keep the pixel-art setup.
- **Never turn on `snapToPixel`**; keep Excalibur `snapToPixel: false`.
