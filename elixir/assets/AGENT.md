# Dashboard Agent Guide

This directory contains the React dashboard for Symphony's Phoenix UI.

## Scope

- Apply these rules to work inside `elixir/assets/src/**` when the task touches
  the dashboard UI.
- Treat [`../docs/dashboard-design-system.md`](../docs/dashboard-design-system.md)
  as the visual source of truth.

## Product Direction

- Build a dense operational workspace, not a marketing page.
- Default to the current dark runtime shell.
- Stay Qonto-inspired in discipline and hierarchy, not in literal layout or
  branding.
- Keep the UI feeling premium through spacing, typography, borders, and
  restraint rather than decoration.

## Hard Rules

- Do not reintroduce a generic Shadcn card mosaic.
- Prefer flat surfaces and fine separators over shadows and gradients.
- Use utility copy that helps operators scan status, freshness, and action.
- Keep headings short and functional.
- Keep the sidebar flush and the header utilitarian.
- Keep one accent color active at a time.
- Preserve French-first UI copy unless the task explicitly changes language.

## Implementation Rules

- Reuse the tokens and utilities in `src/index.css` before adding new ad hoc
  values.
- Prefer evolving shared primitives in `src/components/ui/**` when a styling
  change affects multiple dashboard surfaces.
- Keep tables readable and compact; favor alignment and spacing over badges or
  chrome.
- New panels should earn their surface treatment. If plain layout works, do not
  add a panel wrapper.
- Avoid adding illustrations, hero sections, or decorative motion unless the
  task explicitly requires them.

## Review Checklist

- Does the screen still read clearly in a quick scan?
- Is the hierarchy driven by layout rather than ornament?
- Are states understandable without relying only on color?
- Did the change stay within the shared design system instead of bypassing it?
