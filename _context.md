
## Critical Artifacts — 2026-10-05

| Artifact | Status | Impact | Trigger |
|----------|--------|--------|---------|
| [E] 6 commits on main violating branch-first workflow | CRITICAL | Workflow violations repeated 6x despite correction | Merge PR #22 to document, then enforce branch-first workflow strictly |
| [D] Branch-first workflow is non-negotiable | COMMITTED | All future work must use feature branch → PR → merge | Applies to ALL commits, no exceptions |
| [S] Widget visibility fix pending deployment | BLOCKED | Widget shows NaN on all products until deployed | User must create feature branch, commit fix, push, create PR, merge, then deploy |

