# Agent Information

## Environment and workflow

- This repo is developed on a **Windows operating system**.
- **DO not run `rg`** it will not work, and is not a command.
- **Do not run `npm run build`** or any Vite production build unless the user explicitly asks.
- **Do not run `tsc`** or TypeScript no-emit checks unless the user explicitly asks.
- **Do not start the game** unless the user explicitly asks.
- **Do not review your own changes after editing** unless the user explicitly asks for a review.
- Avoid running `git diff` or `git status` after edits unless you explicitly ask.
- When you need sprite dimensions, always run `npm run sprite:dimensions -- <sprite-path>` instead of guessing.
- Always run `npm run lint` after making changes to files and fix all the errors. Ignore errors on other files.

## MCPs

- Use the Excalibur MCP when unsure about Excalibur APIs, engine behavior, or recommended patterns.
- Excalibur MCP commands: `excaliburjs_list_doc_pages`, `excaliburjs_search_doc_pages`, `excaliburjs_get_doc_source`.
- For a quick list of possible Excalibur objects to use, read `.cursor/skills/excalibur-objects/SKILL.md`.

## Code constraints

- No comments.
- Never use the keywords `else`, `switch`, `for`, `let`, `var`, `function`, `any`, `uknown`.
- Functions should always be defined with `const`.
- Types should always be explicit and clear, if they are not your structure is wrong.
- Classes should always be abstracted if they can be reused.
- Code should be object oriented, using inheritance, and polymorphic design.
- Resuable code should be abstracted.

# Code Design

Design code around interfaces/abstract behaviors rather than concrete implementations. Components should depend on contracts (e.g. interfaces, protocols, abstract classes) so different implementations can be substituted without changing calling code.

- Prefer composition over inheritance.
- Program to interfaces, not implementations.
- Use dependency injection for interchangeable behavior.
- Keep APIs stable while allowing implementation variation.
- Avoid type checks/switches when dynamic dispatch suffices.
- Ensure implementations satisfy the same behavioral contract.