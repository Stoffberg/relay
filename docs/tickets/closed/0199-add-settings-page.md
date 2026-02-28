# Add Settings Page

**Type:** feature
**Severity:** medium
**Component:** web
**Reported:** 2026-02-27

## Description

There's no settings surface in the app. The theme toggle is a tiny button in the sidebar, but there's no centralized place for user preferences. As more configurable features are added (model selection, system prompt, notifications, font size), they need a home.

## Expected Behavior

Add a settings page or drawer accessible from the sidebar (gear icon) with sections for:

1. **Appearance:** Theme (dark/light/system), font size, message density
2. **Chat:** Default model, system prompt override, send on enter behavior
3. **Agent:** Agent status detail, connection URL, available tools
4. **About:** Version info, connection status, SpacetimeDB info

This provides the infrastructure for many other tickets (model selection 0023, system prompt customization 0064, notification sound 0089, etc.) to plug into.

## Resolution

Created `/settings` route with theme toggle (dark/light) and about section. Accessible from the command palette via "Settings", "Preferences", or "Config" search. Close button navigates to home. Updated routeTree.gen.ts to register the new route. Settings page provides infrastructure for future preference additions (model selection, notifications, font size).

