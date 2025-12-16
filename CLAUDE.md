# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI Town is a 2D interactive game where users can walk around and chat with AI-powered agents. Built with Next.js 16, Phaser 3 for the game engine, and React for UI overlays.

## Commands

```bash
npm run dev      # Start development server (localhost:3000)
npm run build    # Production build
npm run lint     # Run ESLint
```

## Architecture

### Core Layers

1. **Next.js App (`src/app/`)** - Main page orchestrates game canvas and React UI overlays
2. **Phaser Game (`src/game/`)** - 2D game world with physics and player/agent sprites
3. **Agent System (`src/agents/`)** - Personality definitions and conversation memory
4. **React Components (`src/components/`)** - UI overlays rendered on top of the game canvas

### Key Data Flow

```
page.tsx (state management)
    ├── GameCanvas.tsx (Phaser wrapper, dynamic import with SSR disabled)
    │       └── WorldScene.ts (game loop, proximity detection)
    │               ├── Player.ts (WASD/arrow movement)
    │               └── Agent.ts (autonomous wandering, states)
    ├── AgentIndicator.tsx (proximity UI)
    └── ChatOverlay.tsx (conversation UI)
            └── /api/chat/route.ts (Vercel AI SDK)
```

### Agent System

- **Personalities** (`src/agents/personalities.ts`): Each agent has a unique system prompt, greeting, color, and movement style (calm/energetic/wanderer/stationary)
- **Memory** (`src/agents/memory.ts`): localStorage-backed conversation history (max 20 messages per agent)
- **Chat API** (`src/app/api/chat/route.ts`): Uses Vercel AI SDK Gateway. Model is configured directly in code (default: `openai/gpt-4o-mini`). Falls back to mock responses if no API key is set

### Phaser Integration Pattern

Phaser must be dynamically imported client-side only. The `GameCanvas` component:
- Uses `dynamic()` with `ssr: false`
- Extends `WorldScene` inline to inject React event callbacks
- Communicates with React via `GameEvents` interface (onNearAgent, onLeaveAgent, onInteractRequest)

### Styling

Uses Tailwind CSS v4 with `@tailwindcss/postcss`. Path alias `@/*` maps to `./src/*`.

## Environment Variables

- `AI_GATEWAY_API_KEY`: API key for the Vercel AI Gateway
- Provider-specific keys (e.g., `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`) depending on the model used

## Switching LLM Models

Uses Vercel AI SDK Gateway - just change the model string in `src/app/api/chat/route.ts`:

```ts
gateway('openai/gpt-4o-mini')      // OpenAI
gateway('anthropic/claude-3-haiku') // Anthropic
gateway('google/gemini-pro')        // Google
```

No additional packages needed.
