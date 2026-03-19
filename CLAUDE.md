# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run setup        # First-time setup: install deps + prisma generate + migrate
npm run dev          # Start dev server with Turbopack
npm run build        # Production build
npm run test         # Run all tests (Vitest + jsdom)
npm run db:reset     # Reset database (force)
```

Run a single test file:
```bash
npx vitest run src/lib/__tests__/file-system.test.ts
```

## Architecture

UIGen is a Next.js 15 app where users describe React components in chat and see live previews. Claude generates code via tool calls that mutate a virtual (in-memory) file system, which is then compiled and rendered in an iframe.

### Request Flow

1. User sends message → `POST /api/chat` (`src/app/api/chat/route.ts`)
2. Route calls `streamText()` (Vercel AI SDK) with two tools: `str_replace_editor` and `file_manager`
3. Claude responds with tool calls → streamed back to client
4. `ChatContext` (`src/lib/contexts/chat-context.tsx`) receives tool calls and dispatches to `FileSystemContext`
5. `FileSystemContext` (`src/lib/contexts/file-system-context.tsx`) mutates the `VirtualFileSystem` in state
6. `PreviewFrame` (`src/components/preview/PreviewFrame.tsx`) detects file changes, runs Babel transform, and updates the iframe

### Key Abstractions

**VirtualFileSystem** (`src/lib/file-system.ts`) — In-memory file tree. No disk I/O. The serialized form (`serialize()`/`deserialize()`) is what gets saved to the `Project.data` JSON column in SQLite.

**AI Tools** — Two tools are registered in the chat route:
- `str_replace_editor` (`src/lib/tools/str-replace.ts`): view, create, str_replace, insert commands. Wraps VirtualFileSystem methods.
- `file_manager` (`src/lib/tools/file-manager.ts`): rename, delete commands.

**JSX Transformer** (`src/lib/transform/jsx-transformer.ts`) — Uses Babel standalone in-browser to transform JSX/TS → JS, strip CSS imports, generate import maps, and produce HTML for the preview iframe.

**Provider** (`src/lib/provider.ts`) — Returns `claude-haiku-4-5` when `ANTHROPIC_API_KEY` is set; otherwise falls back to a `MockLanguageModel` that generates predefined Counter/Form/Card components.

### Auth

JWT sessions via `jose` stored in HTTP-only cookies. `src/lib/auth.ts` handles session create/get/delete. `src/middleware.ts` protects `/api/projects` and `/api/filesystem` routes. Server actions in `src/actions/` use `verifySession()` before touching the DB.

### Data Model (Prisma/SQLite)

The database schema is defined in `prisma/schema.prisma`. Reference it anytime you need to understand the structure of data stored in the database.

- `User`: id, email (unique), password (bcrypt)
- `Project`: id, name, messages (JSON string), data (JSON string — serialized VirtualFileSystem), optional userId

Anonymous sessions store project state in localStorage until the user signs up, at which point the data is migrated.

### UI Layout

`src/app/main-content.tsx` renders a resizable panel layout:
- Left (35%): Chat interface
- Right (65%): Tabs for Preview (iframe) and Code (file tree + Monaco editor)

Components live in `src/components/` split into `chat/`, `editor/`, `preview/`, and `auth/` subdirectories.

## Code Style

Use comments sparingly. Only comment complex code.

## Environment

Copy `.env.example` (or set manually):
```
ANTHROPIC_API_KEY=...   # Optional — app works without it using mock responses
```
The `JWT_SECRET` used in auth is read from `process.env.JWT_SECRET`.
