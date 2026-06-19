# Changelog

## 1.0.0 — 2026-06-19

Initial release. A Pi-native Rust code review tool, sibling to
`@estebanforge/pi-go-review`. Registers a `rust_review` tool that reads git
diffs filtered to `*.rs`, attaches the Rust Code Smells guide, and for each
finding flags the smell **and proposes the idiomatic fix** (corrected code).

### Added
- `rust_review` tool with five diff modes: `working`, `staged`, `all`,
  `commit`, `range`, plus a `path` scope.
- Bundled `extensions/rust-smells.md` guide: 10 anti-patterns across 4 sections
  (Error Handling, API Design, String/Path, Lifetimes/Memory), each with a bad
  example and an idiomatic fix. Loaded at runtime via `import.meta.url`.
- Review output proposes the idiomatic fix for each finding, modeled on the
  guide's Do-This examples.
- Custom TUI rendering for the tool call and result.
