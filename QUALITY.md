# Quality standard

Adopted 2026-10-15 (vws-deploy#300), the same standard as the other vws-* repos. Every change in this repo must be AWS-grade production quality, not demo quality. A PR is done only when the "Quality checklist (required)" in the pull request template is filled with evidence for each item.

1. **Error handling**: every failed request or render path shows a clear error state and is reported; no unhandled promise rejection, crash or blank page on any input.
2. **Retries and timeouts**: every call to a backend API has a timeout (AbortSignal) and retries transient failures with bounded backoff; user actions are never retried silently when they are not idempotent.
3. **Security**: validate all input on the server side of the console as well as in forms, never render untrusted HTML, keep credentials out of the browser bundle, logs and the repo.
4. **Unit tests** (Vitest) for new behavior and failure paths.
5. **Integration tests** (Playwright) at real or faithfully faked boundaries.
6. **Live evidence on vws-test**: commands, screenshots or output from the vws-test cluster, linked or pathed in the PR. Without live evidence the work is not done; a change that never touches vws-test says "N/A: reason".
7. **Observability**: errors and slow requests are visible (structured server logs, no secrets).
8. **Idempotency**: safe on double submit, retry and page reload.
9. **AWS compatibility** where applicable: console flows, names and error messages match the AWS console and APIs.

Formatting: Prettier (`npm run format:check`). CI checks the files a pull request changes; the 110 files that predate the check are reformatted in a follow-up.

Reviewers do not merge a PR whose checklist lacks evidence or a stated reason for N/A.
