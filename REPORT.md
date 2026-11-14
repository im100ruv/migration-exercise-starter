# Migration report

## Task B — color tokens

Ran `npm run migrate:colors -- apps/web-dashboard/src`. It replaced 19 exact token matches across three files: `Legend.tsx`, `chartColors.ts`, and `theme.css`. The token values came from `tokens/primitive-tokens.json`; comments, CSS selectors, `url(#gradient)`, the `#bad` anchor/data-target values, and the `#section-2` route were left unchanged.

Unmatched colors were intentionally not guessed:

| File and line | Value | Nearest RGB token suggestion | Reason left unchanged |
| --- | --- | --- | --- |
| `apps/web-dashboard/src/styles/chartColors.ts:8` | `#FF6D00` | `red-500` (`#d93025`) | No exact orange token; the nearest RGB token may not match the intended orange semantic. |
| `apps/web-dashboard/src/styles/theme.css:21` | `#1a73e8cc` | `blue-500` (`#1a73e8`) | The 8-digit value includes alpha; the primitive token does not preserve its opacity. |
| `apps/web-dashboard/src/styles/theme.css:21` | `#FF6D00` | `red-500` (`#d93025`) | No exact orange token; the nearest RGB token may not match the intended orange semantic. |

## Color enforcement

The checker parses CSS declaration values with PostCSS and its value parser, and TS/TSX/JS string literals with the TypeScript AST; it ignores comments, selectors, URL fragments, and non-color values such as IDs and routes. `npm run check` runs the checker alongside typecheck and codemod tests, and the GitHub Actions workflow runs that command on pushes and pull requests. Only the three existing unresolved values are allowlisted by file, line, value, and count in `codemods/color-allowlist.json`; additional occurrences fail the check.

## Verification

- `npm run migrate:colors -- apps/web-dashboard/src --dry-run` reported zero remaining exact token replacements and listed the three unmatched values above.
- `npm run check` passed: typecheck, Button and color codemod tests, and the color gate.
