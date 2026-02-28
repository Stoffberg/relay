# Add File Drag and Drop to Chat

**Type:** feature
**Severity:** low
**Component:** web
**Reported:** 2026-02-27

## Description

Users can't drag files into the chat to share them with the AI. If a user wants the AI to review a file, they have to either:
1. Copy paste the file contents (loses formatting for large files)
2. Ask the AI to use tools to read the file (requires agent to be online)

Drag and drop is a common pattern in chat applications and would make it easy to share files for analysis.

## Expected Behavior

1. User drags a file over the chat area, a drop zone indicator appears
2. On drop, the file contents are read and attached to the next message
3. Text files are shown as a collapsible preview in the input area
4. On send, file contents are included as context in the message

## Implementation Notes

In `chat.$sessionId.tsx`:
1. Add `onDragOver`, `onDragLeave`, and `onDrop` event handlers to the chat container
2. On drop, use `FileReader` to read text files
3. Show the file as an attachment in the input bar
4. When sending, prepend the file contents to the message (or send as a separate content block)

For the LLM, format the file content as:
```
[File: filename.ts]
```typescript
// file contents here
```
```

Keep it simple: text files only for v1. Binary files should show a "file type not supported" message.

## Resolution

_(fill in when resolving)_
