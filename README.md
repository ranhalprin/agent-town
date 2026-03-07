# Agent World

Pixel-art AI office simulation built with `Next.js`, `React`, and `Phaser`.

`Agent World` turns an LLM workspace into a small playable RPG-style office: you walk around the map, approach employees, assign work in-world, watch them return to their desks, and follow execution through a game HUD, chat timeline, task queue, and status bubbles.

## Highlights
- **Playable AI office**: control a boss avatar inside a shared pixel office instead of using a plain dashboard.
- **In-world task assignment**: walk up to an employee, press `E`, and open an RPG-style interaction menu to assign or stop work.
- **Believable worker behavior**: idle employees wander to POIs such as whiteboards, printers, water coolers, bookshelves, and sofas, then return to their desks.
- **Delayed real dispatch**: if a worker is away from the desk, the task is staged first, the worker returns to the seat, and only then is the real request sent to the gateway.
- **Queue-aware employees**: assigning to a busy worker adds work to that employee's queue instead of silently rerouting to somebody else.
- **Live execution HUD**: chat, tool calls, session switching, token meter, worker panel, seat manager, and task panel all live inside a game-themed UI.
- **Readable task states**: the UI exposes `queued`, `returning`, `sending`, `running`, `done`, and `failed`, so the system never feels mysteriously stuck.
- **Pixel-font bilingual UI**: mixed Chinese/English chat content and in-game text bubbles use a Chinese-compatible pixel font.

## Current Experience

### Game-side
- Move the boss character around the office scene.
- Approach employees to trigger a `Press E` prompt.
- Use an interaction menu to assign tasks or stop active work.
- Watch employees pause for nearby interaction when appropriate.
- See emotes, text bubbles, queue feedback, and task results above workers' heads.
- Observe purposeful roaming, seat activities, and return-to-seat behavior.

### Studio-side
- Send requests through the chat panel or targeted terminal modal.
- Track worker-specific replies in the chat timeline.
- Collapse and expand tool outputs in chat.
- Create and switch between multiple gateway sessions.
- Monitor token/context usage with an RPG-style meter.
- Manage seats, names, roles, and assigned character sprites.

## Task Flow
```text
Player opens menu -> Assign Task
-> task is attached to a specific employee
-> if employee is away, status becomes returning
-> employee goes back to desk
-> request is sent to gateway
-> status becomes sending / running
-> live chat + tool output + worker bubbles update
-> employee completes, fails, or moves to the next queued task
```

## Tech Stack

| Layer | Tech |
| --- | --- |
| App framework | `Next.js 16`, `React 19`, `TypeScript` |
| Rendering | `Phaser 3` |
| UI layer | custom pixel HUD + `shadcn/ui` + `Tailwind CSS 4` |
| Runtime transport | WebSocket gateway proxy via `server.ts` |
| State management | React context + reducer + typed event bus |
| Maps/content | Tiled JSON maps + sprite sheets + object layers |

## Project Structure
```text
agent-world/
├── app/                    # Next.js app shell, layout, styles
├── components/
│   ├── game/               # Phaser scene, entities, pathfinding
│   ├── hud/                # Game-themed HUD panels and dock
│   └── panel/              # Modal-style terminal UI
├── lib/                    # Store, gateway client, event bus, constants
├── public/                 # Maps, fonts, icons, sprites
├── types/                  # Shared domain types
└── server.ts               # Local gateway proxy entry
```

## Local Development

### Prerequisites
- `Node.js 22+`
- `pnpm`
- a compatible gateway server available locally or remotely

### Install
```bash
pnpm install
```

### Run
```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

### Production build
```bash
pnpm build
pnpm start
```

## Gateway Notes

This project expects a gateway-compatible backend for:
- chat / agent execution
- streaming assistant and tool events
- session listing
- session preview
- model metadata

The local dev server proxies gateway traffic through `server.ts`.

## Assets

The repository is structured for a pixel office scene built from:
- office tilesets
- character sprite sheets
- Tiled-authored collision, object, and POI layers

Commercial art assets used during development may not be redistributable. To run this project elsewhere, provide your own compatible tilesets, sprites, and map exports under `public/`.

## Why This Project Is Different

Most AI workspaces are forms, logs, and chat panes.

`Agent World` treats the same workflow as a small simulation:
- workers have desks
- tasks belong to characters
- movement and interruptions matter
- queueing is visible
- execution becomes spatial instead of abstract

The result is part dashboard, part toy, and part realtime coordination game.

## Status

This is an actively iterated prototype with a working gameplay loop and a functional gateway-driven execution UI.

Recent focus areas include:
- worker pathing and collision safety
- in-world interaction design
- delayed task dispatch until return-to-seat
- session UX
- chat and tool presentation
- Chinese pixel font rendering
