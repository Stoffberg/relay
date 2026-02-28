# Add Workspace Concept to Sessions

**Type:** feature
**Severity:** medium
**Component:** web, server
**Reported:** 2026-02-27

## Description

Currently all sessions are in a flat list. As usage grows, users who work on multiple projects have no way to organize conversations by project or workspace.

## Expected Behavior

Add a "workspace" concept:
1. Each session belongs to a workspace (default: "General")
2. The sidebar shows workspaces as expandable groups
3. Users can create/rename/delete workspaces
4. The command palette can filter by workspace
5. Optionally, workspaces can have their own system prompts (combining with ticket 0064)

## Implementation Notes

### Schema
Option 1: Add `workspace: String` field to `Session` table (simple, no new table)
Option 2: Add a `workspace` table with id, name, system_prompt, created_at

Option 1 is simpler for v1.

### Frontend
In `sidebar.tsx`:
1. Group sessions by workspace
2. Show collapsible sections for each workspace
3. Add a "Move to workspace" option in the session context menu
4. Add workspace creation in the command palette

### Server
No changes needed if using option 1 (just a field on session).

## Resolution

_(fill in when resolving)_
