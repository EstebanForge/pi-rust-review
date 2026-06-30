# Changelog

## 1.0.3 — 2026-06-30

### Fixed
- **`path` into a nested git repo failed**: `git` was always run from the
  agent's workspace root (via `pi.exec` without `cwd`), so a `path` pointing
  into a nested repo — whose workspace root is not itself a git repo (e.g. a
  crate under `src/...` in a multi-repo workspace) — errored `not a git
  repository`. The tool now resolves `path`, stats it, sets `cwd` on the git
  invocation, and rebases the pathspec relative to that directory. Git
  pathspecs treat `*` as crossing `/`, so plain `*.rs` recurses under the
  new cwd.
- **Deleted files in a nested repo now resolve**: when the `path` no longer
  exists on disk (uncommitted deletion), the tool walks up from the parent
  dir to the nearest `.git` and anchors there, instead of falling back to
  the workspace root.
- **Clearer failure mode**: when the working directory isn't inside any git
  repo, the thrown error now appends a hint to pass `path` pointing into the
  repo.

## 1.0.2 — 2026-06-24

### Fixed
- **Directory pathspec leaked non-Rust files**: the 1.0.1 fix made directory
  `path` pass through bare so git prefix-matches, but that includes every file
  under the dir (`.ts`, `.json`, etc.), feeding non-Rust diffs into a Rust
  review. Directory paths now use `:(glob)dir/**/*.rs`, which filters to Rust
  AND recurses.

## 1.0.1 — 2026-06-24

### Fixed
- **Pathspec bug**: when `path` was a directory, the tool built
  `dir/**/*.rs`, which silently matched nothing in git (slash before `**`
  blocks recursion). Directory paths now pass through bare so git
  prefix-matches.
- **Stat-line heuristic** in `renderResult` now matches deletion-only diffs
  (rows like ` file.rs | 2 --` are now picked up; previously the `+` check
  filtered them out and the TUI silently showed the fallback).

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
