# Contributing to Agent World

Thanks for your interest in contributing.

This project combines a React/Next.js app with a Phaser-based simulation layer, so the best contributions are usually small, focused, and easy to verify in the running game.

We also welcome contributors from game design, level design, scene design, and interaction design backgrounds, not just application engineers.

## Before You Start

- Open an issue or start a discussion for large features, UI overhauls, or architecture changes.
- Keep pull requests focused. One gameplay or system concern per PR is ideal.
- If your change affects UX, include screenshots or a short video/GIF in the PR.

## Development Setup

### Requirements

- `Node.js 22+`
- `pnpm`
- access to a compatible gateway backend if you want to test live execution

### Install

```bash
pnpm install
```

### Run locally

```bash
pnpm dev
```

### Production build check

```bash
pnpm build
```

## Project Expectations

When contributing, try to preserve the core shape of the project:

- Tasks should feel **spatial**, not abstract.
- Worker behavior should remain **legible to the player**.
- In-world interactions should take priority over hidden automation.
- New UI should match the existing **pixel-game HUD style**.
- Changes should avoid breaking mixed Chinese/English rendering.
- New scenes should expand the world, not just add another hidden settings surface.

## Preferred Contribution Areas

- gameplay feel and interaction clarity
- game design and systems design
- scene design, level layout, and environmental flow
- worldbuilding for future spaces such as libraries, workshops, and world-map destinations
- worker AI and pathing improvements
- HUD readability and task visibility
- session UX
- tool call presentation
- performance and code quality improvements
- bug fixes with clear reproduction steps

## Designers Are Welcome

You do not need to contribute only through TypeScript code.

Valuable contributions can also include:

- interaction design proposals
- scene flow mockups
- level layout ideas
- POI placement and pacing suggestions
- economy and progression ideas for marketplace-style expansion
- memory / tools / plugin management concepts that can be translated into playable spaces

If you are contributing from a game design, level design, or UX background, feel free to open an issue or draft proposal before implementation details are settled.

## Pull Request Guidelines

Please include:

- a short summary of the change
- the reason for the change
- how you tested it
- screenshots or recordings for visible UI/gameplay changes

Good PR descriptions usually answer:

1. What changed?
2. Why was it necessary?
3. How should reviewers verify it?

## Commit Message Style

Use:

```text
<type>(<scope>): <subject>
```

Examples:

```text
feat(hud): add queued and returning task states
fix(worker): delay gateway send until return to seat
refactor(chat): simplify tool bubble rendering
```

Recommended types:

- `feat`
- `fix`
- `docs`
- `refactor`
- `perf`
- `test`
- `chore`

## Code Style Notes

- Use TypeScript consistently.
- Prefer explicit state transitions over hidden side effects.
- Keep Phaser scene logic and React UI concerns separated.
- Avoid introducing global mutable state unless absolutely necessary.
- Prefer extracting constants instead of adding new magic numbers.
- Preserve strict, readable event names when expanding the event bus.

## Testing Changes

At minimum, run:

```bash
pnpm build
```

If your change touches gameplay or UI behavior, also verify manually:

- worker interaction with `Press E`
- assigning tasks to a specific worker
- queued / returning / sending / running transitions
- session switching
- chat readability
- in-world bubble behavior

## Asset Notes

Do not assume commercial art assets can be redistributed.

If your contribution needs new visual assets, prefer:

- placeholders
- clearly replaceable mock assets
- instructions for where custom assets should be provided

## Scope Discipline

Please avoid combining unrelated changes in one PR. For example:

- do not mix README cleanup with pathfinding changes
- do not mix font fixes with session architecture work
- do not refactor the whole store while also changing gameplay rules

Smaller PRs are much easier to review and merge.

## Questions

If anything is unclear, open an issue or start a discussion before implementing a large change.
