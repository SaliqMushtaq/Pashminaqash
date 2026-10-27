---
name: fix-and-run-localhost
description: 'Use when a local web app has an error, will not start, or needs to be run and verified on localhost. Diagnose the actual failure, apply a focused fix, validate it, and report the working local URL.'
argument-hint: 'Describe the error or app to fix and run locally'
user-invocable: true
---

# Fix and Run on Localhost

Resolve a real startup or runtime failure, verify the relevant behavior, and leave the development server running with a usable localhost URL.

## Workflow

1. **Identify the app and failure.** Inspect the entry point, package scripts, and nearby documentation. Read the exact error output, diagnostics, or failing test before changing code. If no error is provided, reproduce the issue with the project's documented start command and use its output as evidence. Do not invent a code defect when startup succeeds.
2. **Check prerequisites.** Verify the installed runtime and required dependencies against the project configuration and docs. Distinguish environment or dependency failures from application-code failures. Avoid reinstalling or changing versions unless evidence calls for it.
3. **Make the smallest root-cause fix.** Follow existing project patterns, preserve unrelated user changes, and avoid broad refactors. State a testable hypothesis before the edit and choose a focused check that could disprove it.
4. **Validate immediately.** Run the narrowest relevant test, check, or build after the edit. If no edit was needed, continue with startup verification. When validation fails, use its concrete output to correct the same issue and rerun the check.
5. **Start the app locally.** Use the project's documented development/start command. Keep the server process running. If the default port is occupied, inspect whether the existing listener is the app before choosing another supported port; do not kill unrelated processes.
6. **Verify readiness.** Confirm the server's ready output and make an HTTP request to the reported localhost URL. Check a representative page and, when available, one simple health/API route. A successful process launch alone is not proof that the app is usable.
7. **Report clearly.** Give the exact localhost URL, the fix or that no fix was needed, and the checks performed. Mention any remaining failure or limitation; never claim readiness without an HTTP response.

## Completion Criteria

- The observed failure is fixed, or reproduction shows there was no failure to fix.
- A focused validation succeeds, or its limitation is stated.
- The app responds over HTTP at the reported localhost URL.
- The development server is left running when the environment supports persistent processes.