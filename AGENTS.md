# Agent context — webgame (Excalibird)

## What it is

Excalibird is a small **multiplayer pixel platformer**: an **Excalibur** client with a **Node** server for sync.

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
