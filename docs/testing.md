# Testing & Browser-Automatisierung

## Code-Qualität

```bash
npm run type-check && npm run lint
npm run build   # optional
```

## Test Accounts (E2E)

**Account 1**
- Email: `test@example.com`
- Passwort: `test123456`
- Haushalt: Test-Haushalt
- Invite Code: `FD1EB9CE`

**Account 2**
- Email: `test2@example.com`
- Passwort: `test123456`
- Haushalt: Test-Haushalt (beigetreten via `FD1EB9CE`)

## Claude-in-Chrome (Browser-Erweiterung)

- **Test-URL**: `http://localhost:5173/Household-planner/`
- Features IMMER mit der Chrome-Erweiterung testen (`mcp__claude-in-chrome__*` Tools),
  NICHT mehr mit Playwright
- Tools bei Bedarf via ToolSearch laden (Core-Set: `tabs_context_mcp`, `navigate`,
  `computer`, `read_page`); für Debugging `read_console_messages`
- **Mobile Testing**: IMMER mit schmalem Viewport testen (z.B. 390×800 für Smartphone).
  `resize_window` vor dem Testen aufrufen — Desktop-Breite ist kein echtes Mobile Testing.

## Context7 (MCP)

Bei jedem Feature für Up-to-date Library-Docs konsultieren (Vue 3, Pinia, Supabase, TypeScript).
