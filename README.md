# @estebanforge/pi-rust-review

Rust code review against the **Rust Code Smells & Idiomatic Anti-Patterns** guide. Registers a `rust_review` tool that reads git diffs, filters to `.rs` files, attaches the guide, and for each finding flags the smell **and proposes the idiomatic fix** (corrected code).

Sibling to [`@estebanforge/pi-go-review`](https://github.com/EstebanForge/pi-go-review). Pair with `cargo clippy` for compiler-grade lint coverage; this tool focuses on design and idiomatic mistakes clippy may not flag.

## Install

```
pi install npm:@estebanforge/pi-rust-review
```

## Usage

Ask Pi: **"review my Rust changes."**

The tool runs `git` in one of five modes:

| Mode | Description | Needs `ref` |
| --- | --- | --- |
| `working` | Unstaged changes | No |
| `staged` | Staged (cached) changes | No |
| `all` | All changes vs HEAD | No |
| `commit` | A specific commit | Yes (SHA) |
| `range` | A commit range | Yes (e.g. `main..HEAD`) |

Narrow scope with `path` (a file or directory).

## What it does

1. Reads the git diff filtered to `*.rs`.
2. Attaches the Rust Code Smells guide (anti-pattern + idiomatic fix for each).
3. The LLM reviews the diff and returns findings that **propose the fix**:

| Severity | Meaning |
| --- | --- |
| Bug / Critical | Must fix |
| Suggestion | Should consider |
| Nit | Minor improvement |
| Good pattern | Well done |

Each finding cites the section + anti-pattern name, the file + code fragment, and a corrected snippet modeled on the guide's idiomatic-fix examples. Ends with a **Verdict**: Approve / Request Changes / Needs Discussion.

## Guide sections

| Section | Anti-patterns |
| --- | --- |
| 1. Error Handling Traps | Excessive `.unwrap()` · Sentinel values (`-1` / `""`) |
| 2. API Design & Type Architecture | `&String`/`&Vec<T>` indirection · Two-state uninitialized objects · Hardcoded file inputs |
| 3. String & Path Manipulation | Paths as strings · String-concatenation loops |
| 4. Lifetimes & Memory Mismanagement | Unnecessary `.clone()` · Overused smart pointers (`Rc<RefCell<T>>`) · Conflicting reference lifetimes |

The full guide ships as a bundled, editable `extensions/rust-smells.md`.

## TUI rendering

Custom rendering for both the tool call and its result: mode, file count, insertions/deletions, and truncation status at a glance.

## License

MIT
