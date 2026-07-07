## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- ALWAYS read graphify-out/GRAPH_REPORT.md before reading any source files, running grep/glob searches, or answering codebase questions. The graph is your primary map of the codebase.
- IF graphify-out/wiki/index.md EXISTS, navigate it instead of reading raw files
- For cross-module "how does X relate to Y" questions, prefer `graphify query "<question>"`, `graphify path "<A>" "<B>"`, or `graphify explain "<concept>"` over grep — these traverse the graph's EXTRACTED + INFERRED edges instead of scanning files
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

# Guidelines

## Automatic Changelog Updates
- Whenever you modify source code, configuration files, or database schemas, you **MUST** automatically update the root `CHANGELOG.md` file with a concise summary of your changes under the `## [Unreleased]` or target version header. 
- Do not wait for the user to explicitly prompt or ask you to update the changelog; treat this as a mandatory completion step for every coding task.

