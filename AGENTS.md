# Agent Information

## Commands

- Use `npm run sprite:dimensions -- <sprite-path>` to get the dimensions of a sprite.
- Use `npm run sprite:list` to get all the available sprites in the `public/assets/` folder.

## Environment and workflow

- This repo is developed on a **Windows operating system**.
- **Do not use `&&`** when chaining commands, it will not work on **Windows** use `;` to seperate commands.
- **Do not run `rg`** it will not work, and is not a command.
- **Do not run `npm run build`** or any Vite production build unless the user explicitly asks.
- **Do not run `tsc`** or TypeScript no-emit checks unless the user explicitly asks.
- **Do not start the game** unless the user explicitly asks.
- **Do not review your own changes after editing** unless the user explicitly asks for a review.
- **Do not run** `git diff` or `git status`.
- Always run `npm run lint` after making changes to files and fix all the errors. Ignore errors on other files.

## MCPs

- **Always** use the Excalibur MCP when necessary: `excaliburjs_list_doc_pages`, `excaliburjs_search_doc_pages`, `excaliburjs_get_doc_source`.

## Code constraints

- No comments.
- Never use the keywords `else`, `switch`, `for`, `var`, `function`, `any`, `uknown`.
- Only use `let` when necessary, otherwise use `const`.
- Functions should always be defined with `const`.
- Types should always be explicit and clear, if they are not your structure is wrong.
- Classes should always be abstracted if they can be reused.
- Code should be object oriented, using inheritance, and polymorphic design.
- Resuable code should be abstracted.