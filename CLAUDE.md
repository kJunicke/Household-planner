# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is "Putplan" (cleaning plan), a gamified cleaning task management application built as a Vue.js 3 project. The application is designed to help track and gamify household cleaning tasks with XP, levels, achievements, and leaderboards. The main development is happening in the `putzplan/` subdirectory.

**Important: This is a learning project.** The primary goal is to teach the user how to build modern web applications. When working on this codebase, always:
- Explain what you're doing and why
- Teach best practices and development patterns
- Show alternative approaches when relevant
- Help the user understand the underlying concepts
- Be educational rather than just implementing features

## Project Structure

The repository has a nested structure:
- Root directory contains a parent `package.json` with Supabase dependency
- `putzplan/` contains the main Vue.js application
- Development plan is documented in `putzplan-dev-plan.md` (German)

## Common Commands

All commands should be run from the `putzplan/` directory:

```bash
cd putzplan
```

### Development
- `npm run dev` - Start development server with hot reload
- `npm run build` - Type-check, compile and minify for production  
- `npm run build-only` - Build without type checking
- `npm run preview` - Preview production build locally

### Code Quality
- `npm run lint` - Run ESLint with auto-fix
- `npm run format` - Format code with Prettier
- `npm run type-check` - Run Vue TypeScript compiler

## Tech Stack & Architecture

- **Frontend**: Vue.js 3 with Composition API and `<script setup>` syntax
- **TypeScript**: Full TypeScript support with vue-tsc
- **State Management**: Pinia stores (Composition API style)
- **Routing**: Vue Router with lazy-loaded routes
- **Build Tool**: Vite with Vue plugin and dev tools
- **Backend**: Supabase (database, authentication, real-time)
- **Styling**: CSS with scoped styles, CSS custom properties

### Key Directories
- `src/components/` - Reusable Vue components
- `src/views/` - Route-level components  
- `src/stores/` - Pinia state stores
- `src/router/` - Vue Router configuration
- `src/assets/` - Static assets and global styles
- `src/lib/` - Utility libraries and external service configurations

### Architectural Patterns
- Uses Vue 3 Composition API with `<script setup>` syntax
- Pinia stores follow the Composition API pattern with `defineStore()`
- Route-level code splitting with dynamic imports
- Alias `@/` configured for `src/` directory

## Development Features Planned

Based on `putzplan-dev-plan.md`, the application will include:

### Core Features
- User authentication via Supabase Auth
- Task management with categories (Kitchen, Bathroom, Living Room)
- XP system with different rewards per task category
- Level progression system
- Achievement/badge system
- Streak tracking for daily cleaning
- Personal statistics and progress tracking
- Leaderboard functionality

### Database Schema (Supabase)
- `tasks` - Task templates with XP rewards and categories
- `completed_tasks` - Track completed tasks with timestamps
- `user_stats` - User XP, level, streaks, and totals
- `achievements` - User achievement unlocks

## Node.js Version

Requires Node.js `^20.19.0 || >=22.12.0` as specified in package.json engines.

## Environment Configuration

The project uses environment variables for configuration:

### Setup
- Copy `.env.example` to `.env` and fill in your values
- Required variables:
  - `VITE_SUPABASE_URL` - Your Supabase project URL
  - `VITE_SUPABASE_ANON_KEY` - Your Supabase anon/public key (safe to be public)

### Supabase Integration
- Supabase client is configured in `src/lib/supabase.ts`
- Uses environment variables with error checking
- The anon key is public and can be safely committed to Git
- All VITE_ prefixed variables are available in the browser

## Development Notes

- The project has completed Supabase setup and environment configuration
- German language is used in planning documents and likely the UI
- PWA features and mobile optimization are planned
- Real-time updates between devices planned via Supabase
- No test framework is currently configured