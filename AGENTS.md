<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# VWS console

This repo started from the website cloner template and now implements a mock cloud console. Screen notes are in `docs/research/console/`.

## Using pstack

This project and every other VWS project use pstack for agent work.

| Rule                                                                                                                                                                                                | What enforces it                                           |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Nontrivial design that crosses a function boundary goes through the architect skill before implementation.                                                                                          | Judgment. The skill lives in the pstack plugin.            |
| A contested design goes through the interrogate skill before it ships.                                                                                                                              | Judgment. Reviewers do not auto-apply changes.             |
| A repeated agent mistake goes through the correct skill. Fix it in architecture, then types, then lint, then a test. Write the rule here only after those levels cannot hold it.                    | This table. Add a row when the operator corrects a repeat. |
| Visual parity is checked on the running app against reference images. Reference images are local-only and never committed. No AWS screenshots, logos, or trademarks go in the repo.                 | Review of the diff.                                        |
| All coding and dev work follows pstack's poteto-mode style. Read the poteto-mode skill first. Subagents run with effort high. Cursor cloud agents are never used. Only Grok Bots do the work.       | Judgment and review of the PR.                             |
| The header shows the VWS wordmark and substitute icons. Do not add an AWS logo, an AWS wordmark, or original icon files. Service menu names stay EC2, EBS, S3, VPC, and the other reference labels. | Review of the diff and the screenshots.                    |

# Website Reverse-Engineer Template

## What This Is

A reusable template for reverse-engineering any website into a clean, modern Next.js codebase using AI coding agents. The Next.js + shadcn/ui + Tailwind v4 base is pre-scaffolded — just run `/clone-website <url1> [<url2> ...]`.

## Tech Stack

- **Framework:** Next.js 16 (App Router, React 19, TypeScript strict)
- **UI:** shadcn/ui (Base UI primitives, Tailwind CSS v4, `cn()` utility)
- **Icons:** Lucide React (default — will be replaced/supplemented by extracted SVGs)
- **Styling:** Tailwind CSS v4 with oklch design tokens
- **Deployment:** Vercel

## Commands

- `npm run dev` — Start dev server
- `npm run build` — Production build
- `npm run lint` — ESLint check
- `npm run typecheck` — TypeScript check
- `npm run check` — Run lint + typecheck + build

## Code Style

- TypeScript strict mode, no `any`
- Named exports, PascalCase components, camelCase utils
- Tailwind utilities or scoped CSS; avoid inline styles unless behavior needs dynamic values
- 2-space indentation
- Responsive: mobile-first

## Design Principles

- **Pixel-perfect emulation** — match the target's spacing, colors, typography exactly
- **No personal aesthetic changes during emulation phase** — match 1:1 first, customize later
- **Real content** — use actual text and assets from the target site, not placeholders
- **Beauty-first** — every pixel matters

## Project Structure

```
src/
  app/              # Next.js routes
  components/       # React components
    ui/             # shadcn/ui primitives
    sites/<site>/   # Source-specific components, including extracted SVGs
  lib/
    utils.ts        # cn() utility (shadcn)
  types/            # TypeScript interfaces
  hooks/            # Custom React hooks
public/
  sites/<site>/     # Source-specific images, fonts, video, and other assets
docs/
  research/<site>/  # Page brief, asset map, and inspection evidence
  design-references/ # Local-only reference images, never committed
scripts/            # Asset download scripts
.agents/
  skills/
    clone-website/  # Canonical cross-agent cloning workflow
.claude/
  commands/
    clone-website.md # Thin Claude Code invocation bridge
```

## Agent Workflow

- Edit `.agents/skills/clone-website/` for cloning-workflow changes. It is the canonical skill used by Codex, Cursor, and OpenCode.
- Keep `.claude/commands/clone-website.md` as a thin Claude Code bridge to the canonical skill; do not duplicate the workflow there.

## /correct loop

1. When a bot is corrected (by the user Su Kim, tmp or eggbot, or by a failed `vws verify`), it opens an issue the same day with the `incident` label using the `.github/ISSUE_TEMPLATE/incident.yml` form. It must fill in the correction and "the check that would have caught this".
2. Every few days vws-verify runs a gardener pass. It groups open incidents by cause and promotes repeated ones to a check (test, lint, guard rule, archtest), not a sentence. The check must actually fail on an input that contains the mistake.
3. When the promoting PR is merged, close the incident with its link. An incident that will not be promoted is closed with the reason.
4. The milestone report (to tmp) lists the number of incidents in the period and the checks promoted.
5. The `incident` label is defined in `.github/labels.yml`, copied from vws-deploy. That file is only a definition and does not create the label on GitHub. `scripts/guard.sh correct` runs `scripts/guard-agents.sh correct`, which checks this section and its body, the required fields of the form and the label definition; `repo-guard.yml` runs it on every pull request and `scripts/guard_test.sh` shows it fails on an empty section.

## Insider-risk guardrails

Bots are insider risks too. The rules below have no exceptions.

1. **Independent verification**: no bot or model verifies its own important results (merges, security, data). Verification is done by a bot other than the author (or a person). (Process rule; CI cannot enforce it.)
2. **Records**: every change leaves a trail of issue → PR (`Part of #N`) → commits. Work logs go in the PR body or issue comments in a form people can read. No force-push or history rewriting (except with the user's approval).
3. **Failure tests**: new features are not tested on the happy path only. Include at least one case each for power loss/restart, idempotent re-runs, and malicious or boundary input, or state in the PR why that is impossible.
4. **Least privilege**: no direct pushes to main. Every change is a single PR from its own branch cut from main. No stacked PRs. No local merges. Tokens are scoped to the repo in question. RBAC covers only the resources the service code actually calls, as a Role (namespace scope) where possible.
5. **Separation of duties**: author bot ≠ verifier bot ≠ merge decision. An author bot never merges its own PR. Merge only when base == main and every CI check on the head commit is success.
6. **Isolation and emergency stop**: a bot or agent is stopped immediately at the user's request, or by the orchestrator stopping that bot's session and revoking its token (`gh auth`/PAT revoke). Risky work runs only in a sandbox (the box or a temporary cluster). No access to production clusters.
7. **Incident disclosure**: rule violations and incidents are never hidden; record them in an issue as `Cause / Impact / Action / Prevention` (label `incident`).
