# Romulus

A real-time strategy browser game where players compete for total domination on a hexagonal grid. Manage your population across three roles—Labour, Military, and Spies—to generate resources, conquer territory, and undermine opponents.

## Game Overview

- **Players:** 2-8
- **Session length:** 30 minutes to 2 hours
- **Platform:** Browser-based multiplayer

Every person in your empire is a strategic choice: worker, soldier, or spy. Soldiers conquer openly—visible to all. Spies conquer invisibly—cities turn before anyone knows why. You never have enough people for both. Neither does anyone else.

## Tech Stack

### Frontend
- **React 19** - UI framework
- **TypeScript** - Type-safe development
- **Vite** - Fast build tool and dev server
- **Tailwind CSS** - Utility-first styling
- **Three.js** + **React Three Fiber** - 3D hexagonal grid visualization
- **TanStack Router** - Type-safe routing
- **Biome** - Linting and formatting

### Backend
- **Convex** - Real-time database and backend functions

### Key Libraries
- `@base-ui/react` - Accessible UI primitives
- `cmdk` - Command palette interface
- `recharts` - Data visualization
- `react-hook-form` + `zod` - Form handling and validation
- `next-themes` - Theme management

## Setup

Install dependencies using Bun:

```bash
bun install
```

## Development

Start the Vite development server:

```bash
bun run dev
```

Start the Convex backend (in a separate terminal):

```bash
bun run dev:convex
```

## Commands

| Command | Description |
|---------|-------------|
| `bun run dev` | Start Vite dev server |
| `bun run dev:convex` | Start Convex backend in dev mode |
| `bun run build` | Build for production |
| `bun run lint` | Run Biome linter |
| `bun run lint:fix` | Fix linting issues automatically |

## Project Structure

- Frontend source code is in the `src/` directory
- Convex backend functions are in the `convex/` directory
- Game specification is in `spec.md`

## Game Mechanics

For detailed game rules and mechanics, see [spec.md](./spec.md).

Key features include:
- **Tick-based real-time gameplay** - 1 tick per second, server-authoritative
- **Population management** - Dynamic allocation between Labour, Military, and Spies
- **Fog of war** - Limited vision based on controlled territory
- **City building** - Expand to increase population cap
- **Combat system** - Military engagements and spy operations
- **Alliance mechanics** - Cooperative gameplay with inevitable betrayal
