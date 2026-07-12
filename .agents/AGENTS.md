# Workspace Agent Guidelines

## Automatic Changelog Updates
- Whenever you modify source code, configuration files, or database schemas, you **MUST** automatically update the root `CHANGELOG.md` file with a concise summary of your changes under the `## [Unreleased]` or target version header. 
- Do not wait for the user to explicitly prompt or ask you to update the changelog; treat this as a mandatory completion step for every coding task.

## Pushing to Remote Repositories
- **CRITICAL**: Never run `git push origin` or push code to the remote repository `origin` without explicit prior permission from the user in the chat. Pushing to other remotes (e.g., `upstream`) is permitted, but the `origin` remote must not be pushed to without permission.

## Automated Testing Guidelines
- Whenever you add new utility functions, API endpoints, or database helpers, you MUST write corresponding Vitest unit tests (e.g., `*.test.ts`) in the same directory covering their logic.
- Avoid introducing untested code to the codebase. Ensure that any code changes do not break the existing test suites by running `pnpm test`.

