<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# VWS console

This repo started from the website cloner template and now implements a mock cloud console. Screen notes are in `docs/research/console/`.

## pstack 사용

This project and every other VWS project use pstack for agent work.

| Rule | What enforces it |
| --- | --- |
| Nontrivial design that crosses a function boundary goes through the architect skill before implementation. | Judgment. The skill lives in the pstack plugin. |
| A contested design goes through the interrogate skill before it ships. | Judgment. Reviewers do not auto-apply changes. |
| A repeated agent mistake goes through the correct skill. Fix it in architecture, then types, then lint, then a test. Write the rule here only after those levels cannot hold it. | This table. Add a row when the operator corrects a repeat. |
| Visual parity is checked on the running app against reference images. Reference images are local-only and never committed. No AWS screenshots, logos, or trademarks go in the repo. | Review of the diff. |
| The header shows the VWS wordmark and substitute icons. Do not add an AWS logo, an AWS wordmark, or original icon files. Service menu names stay EC2, EBS, S3, VPC, and the other reference labels. | Review of the diff and the screenshots. |

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
