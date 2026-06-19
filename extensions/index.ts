/**
 * pi-rust-review — Code review powered by the "Rust Code Smells & Idiomatic
 * Anti-Patterns" guide.
 *
 * Registers a rust_review tool that reads Rust code changes (git diff) and
 * returns them alongside the smells guide (anti-pattern + idiomatic fix for
 * each). The LLM reviews the diff, flags anti-patterns, AND proposes the
 * idiomatic fix (corrected code) for each finding.
 *
 * Features:
 *   - Reviews staged, unstaged, commit, or range diffs filtered to .rs files
 *   - Bundles the smells guide as a sibling .md asset (human-editable)
 *   - Categorizes findings: Bug/Critical, Suggestion, Nit, Good pattern
 *   - Custom TUI rendering for call + result
 *   - System prompt injection so the agent auto-invokes when reviewing Rust code
 *
 * Sibling to @estebanforge/pi-go-review. Pair with `cargo clippy` for
 * compiler-grade lint coverage.
 */
import type { ExtensionAPI, ThemeColor } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { StringEnum } from "@earendil-works/pi-ai";
import { Text } from "@earendil-works/pi-tui";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// The smells guide ships as a sibling markdown file (source of truth, editable).
// Load lazily; memoize only on success so a transient read failure (e.g. a
// mid-install state during a Pi hot-reload) stays recoverable on the next call
// instead of pinning the degraded message for the process lifetime. Under Pi's
// jiti loader, import.meta.url resolves to this source file, so the sibling .md
// is reachable next to it.
let _guide: string | null = null;
function getGuide(): string {
	if (_guide !== null) return _guide;
	try {
		const here = path.dirname(fileURLToPath(import.meta.url));
		_guide = readFileSync(path.join(here, "rust-smells.md"), "utf8");
		return _guide;
	} catch {
		return "## Rust smells guide unavailable\n\nThe bundled `rust-smells.md` could not be read. Reinstall the package or check the install.";
	}
}

// git argument prefix per mode; the caller pathspec is appended after "--".
const STAT = ["--stat", "--patch"];
const GIT_PREFIX: Record<string, string[]> = {
	working: ["diff", ...STAT],
	staged: ["diff", "--cached", ...STAT],
	all: ["diff", "HEAD", ...STAT],
	commit: ["show", ...STAT],
	range: ["diff", ...STAT],
};

interface RustReviewDetails {
	mode: string;
	ref?: string;
	path?: string;
	insertions: number;
	deletions: number;
	rsFilesFound: number;
	truncated: boolean;
}

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "rust_review",
		label: "Rust Review",
		description:
			"Review Rust code changes against the Rust Code Smells guide. " +
			"Reads git diffs (staged, unstaged, commits, or ranges), filters to .rs files, " +
			"and returns the diff alongside the anti-pattern guide. " +
			"Each finding flags the smell AND proposes the idiomatic fix (corrected code). " +
			"Use this whenever reviewing Rust code, PRs, or changes before committing.",
		promptSnippet: "Review Rust code changes and propose idiomatic fixes from the smells guide",
		promptGuidelines: [
			"Use rust_review when the user asks to review Rust code, check Rust changes, or audit a Rust PR.",
			"After receiving the diff and the guide, analyze every changed file against the anti-patterns.",
			"For each finding: cite the section and anti-pattern name, give file:line/fragment, categorize (Bug/Suggestion/Nit), AND propose the idiomatic fix as a corrected code snippet modeled on the guide's Do-This examples.",
			"Only flag anti-patterns actually present. Note Good patterns too.",
			"End with a verdict: Approve, Request Changes, or Needs Discussion.",
		],
		parameters: Type.Object({
			mode: StringEnum(["working", "staged", "commit", "range", "all"] as const, {
				description: "working=unstaged, staged=cached, commit=specific SHA, range=two refs, all=HEAD diff",
			}),
			ref: Type.Optional(Type.String({ description: "Commit SHA, branch, or range (e.g. main..HEAD). Required for commit/range." })),
			path: Type.Optional(Type.String({ description: "Limit to file or directory (e.g. src/auth)" })),
		}),
		async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
			const { mode, ref, path: filePath } = params;
			const EXT = ".rs";
			const GLOB = "*" + EXT;
			const MAX_LINES = 1500;

			if ((mode === "commit" || mode === "range") && !ref) {
				throw new Error(`ref required for ${mode} mode`);
			}

			// Narrow to the caller's file/dir, else default to all .rs files.
			const pathspec = !filePath
				? GLOB
				: filePath.endsWith(EXT)
					? filePath
					: filePath.replace(/\/+$/, "") + "/**/*" + EXT;
			const gitArgs = [...GIT_PREFIX[mode], ...(ref ? [ref] : []), "--", pathspec];

			const result = await pi.exec("git", gitArgs, { signal, timeout: 30000 });
			if (result.code !== 0) throw new Error(`git failed (${result.code}): ${result.stderr}`);

			const base = { mode, ref, path: filePath };
			if (!result.stdout.trim()) {
				return {
					content: [{ type: "text" as const, text: "No Rust file changes found. Try: staged, working, all, commit, or range." }],
					details: { ...base, insertions: 0, deletions: 0, rsFilesFound: 0, truncated: false } satisfies RustReviewDetails,
				};
			}

			const lines = result.stdout.split("\n");

			// Anchor to the LAST stat line: in commit/range mode git emits the commit
			// message before the diffstat, so a message containing "N files changed"
			// would otherwise be parsed as the stat and poison the metrics.
			const statLine = lines.filter((line) => /\d+ files? changed/.test(line)).pop() ?? "";
			const insertions = parseInt(statLine.match(/(\d+) insertions?/)?.[1] ?? "0", 10);
			const deletions = parseInt(statLine.match(/(\d+) deletions?/)?.[1] ?? "0", 10);
			const rsFilesFound = result.stdout.match(/^diff --git a\/.*\.rs b\/.*\.rs$/gm)?.length ?? 0;

			const truncated = lines.length > MAX_LINES;
			const diffText = truncated ? lines.slice(0, MAX_LINES).join("\n") : result.stdout;

			const text = [
				`## Rust Code Review: ${mode}${ref ? " " + ref : ""}${filePath ? ` (${filePath})` : ""}`,
				"",
				`**${rsFilesFound}** Rust files, **+${insertions}** / **-${deletions}**`,
				"",
				"### Diff",
				"",
				"```diff",
				diffText,
				"```",
				"",
				...(truncated ? [`> Truncated to ${MAX_LINES} lines. Use path param to focus.`, ""] : []),
				"---",
				"",
				"### Review Instructions",
				"",
				"Analyze the diff against the Rust Code Smells guide below.",
				"For each anti-pattern found:",
				"  - cite the **section + anti-pattern name** (e.g. 'Error Handling Traps > Excessive .unwrap()');",
				"  - give **file:line / code fragment**;",
				"  - categorize: Bug/Critical, Suggestion, or Nit;",
				"  - **propose the idiomatic fix** as a corrected code snippet, modeled on the guide's ⛵ Do-This examples.",
				"Only flag anti-patterns **actually present**, most impactful first. Note Good patterns too.",
				"End with **Verdict**: Approve / Request Changes / Needs Discussion.",
				"",
				getGuide(),
			].join("\n");

			return {
				content: [{ type: "text" as const, text }],
				details: { ...base, insertions, deletions, rsFilesFound, truncated } satisfies RustReviewDetails,
			};
		},
		renderCall(args, theme, _ctx) {
			const modeColors: Record<string, ThemeColor> = {
				working: "warning",
				staged: "accent",
				commit: "success",
				range: "success",
				all: "warning",
			};
			let label = theme.fg("toolTitle", theme.bold("rust_review "));
			label += theme.fg(modeColors[args.mode] ?? "accent", args.mode);
			if (args.ref) label += theme.fg("muted", " " + args.ref);
			if (args.path) label += theme.fg("dim", " — " + args.path);
			label += theme.fg("dim", "  (Rust Smells)");
			return new Text(label, 0, 0);
		},
		renderResult(result, { expanded, isPartial }, theme, _ctx) {
			if (isPartial) return new Text(theme.fg("warning", "Scanning Rust changes..."), 0, 0);
			const details = result.details as RustReviewDetails | undefined;
			if (!details || details.rsFilesFound === 0) return new Text(theme.fg("dim", "No Rust changes found"), 0, 0);

			let summary = theme.fg("accent", details.rsFilesFound + " Rust files");
			summary += theme.fg("dim", " | ") + theme.fg("success", "+" + details.insertions) + theme.fg("dim", "/") + theme.fg("error", "-" + details.deletions);
			summary += theme.fg("dim", " | ") + theme.fg("muted", "smells guide + fixes");
			if (details.truncated) summary += theme.fg("warning", " (truncated)");

			if (!expanded) return new Text(summary, 0, 0);

			summary += "\n" + theme.fg("dim", "─".repeat(50));
			const content = result.content[0];
			if (content?.type === "text") {
				const statLines = content.text.split("\n").filter((line: string) => line.includes("|") && line.includes("+")).slice(0, 8);
				for (const line of statLines) summary += "\n" + theme.fg("dim", "  " + line.trim());
				if (statLines.length === 0) summary += "\n" + theme.fg("dim", "  (expand for diff + guide)");
			}
			return new Text(summary, 0, 0);
		},
	});
}
