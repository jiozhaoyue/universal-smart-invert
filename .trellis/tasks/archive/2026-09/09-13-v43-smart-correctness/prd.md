# v4.3 flash-black guard + partial element recolor + inversion sanity net

## Goal

Merge the flash-black early darkener into the main script (tiny document-start guard, bgReplace-only, self-cleaning) and flip the extension to document_start with boot hardening; add element-rule action 'recolor' for partial element changes (recolor only the light parts of a black-and-white element via the bucket engine, no filter); add an inversion sanity net: dark-dominant images are never auto-inverted (kills wrong-white verdicts) and borderline pixel decisions get one bounded re-validation.

## Requirements

- TBD

## Acceptance Criteria

- [ ] TBD

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
