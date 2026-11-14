# Design-system migration rollout

## Discover and order the apps

Start with a read-only inventory across all ten apps: count legacy `Button` imports/usages, other `@old/ui` components, and token-matchable, unmatched, and non-color hex strings. In the Nx repo, use `nx show projects`/`nx graph` to map the six apps and their shared libraries; scan the four standalone repos with the same versioned inventory command. Ask each of the eight teams for an owner, deadline, test/build commands, release cadence, and any high-risk screens. Pilot one representative low-risk Nx app and one standalone app; then order the rest by dependency/reuse, migration risk, team readiness, and deadline, adjusting after the pilots.

## Distribute tooling and keep PRs reviewable

Release the tested scripts in [`codemods/`](./codemods/) as a versioned internal package, pinning the same version in every repo. In Nx, expose per-project `migrate-design-system` and `check-design-system` targets that pass the selected app's `src` path to the CLI; in each standalone repo, add equivalent npm scripts and run the same pinned package. Keep the root path and dry-run option explicit so teams can preview before writing files.

Open a tooling/version PR first. Then make one app-scoped migration PR at a time (or a small same-team batch in Nx), separating Button conversion from token changes when that makes review easier. Keep flagged/manual cases in a follow-up PR rather than hiding them in a large generated diff. Existing and new components can coexist during rollout, so teams can merge without a feature freeze.

## Verify, merge, and roll back

For each PR, review the dry-run output and report, run codemod fixture/idempotence tests, and run the app's typecheck, unit/integration tests, and build. In Nx CI, run the affected app targets plus the design-system checks; in standalone CI, run the repo's equivalent checks. Use visual/component checks on representative screens for changes that affect styling. Merge only with the app owner and CI approval. Keep each PR independently revertible; if a regression appears, revert that PR and rerun the same checks before retrying. Do not remove the legacy library until inventory and CI show no remaining supported uses.

## Track the long tail and prevent regressions

Maintain a rollout board with per-app baseline, migrated, flagged, remaining, PR, owner, and deadline fields; review it with all eight teams weekly. Give each exception an owner and due date, and use the report's nearest-token suggestions only as review input—not automatic replacements. Run a targeted AST check in CI that rejects new `Button` imports from `@old/ui` while allowing the still-needed `Card`/`Modal` imports. Keep the color checker in CI with only reviewed, file-scoped exceptions; require an expiry/review date for each exception.

## AI use

Use AI for inventory summaries, fixture/test ideas, and explaining diffs; keep those outputs advisory. Do not use it to choose ambiguous color semantics, approve generated edits, or bypass the AST/check/test gates. A team member must review every PR, validate the report against the source, and be able to explain and modify the migration during the walkthrough.
