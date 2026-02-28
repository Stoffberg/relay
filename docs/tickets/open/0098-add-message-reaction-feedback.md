# Add Thumbs Up/Down Feedback on AI Responses

**Type:** feature
**Severity:** low
**Component:** web, server
**Reported:** 2026-02-27

## Description

There's no way for users to provide feedback on AI responses. This makes it impossible to:
1. Track response quality over time
2. Identify problematic conversations for debugging
3. Build a feedback dataset for future improvements
4. Know which model/prompt combinations work best

## Expected Behavior

Add thumbs up/thumbs down buttons on assistant messages:
1. Appear on hover, similar to the copy button
2. On click, store the feedback in SpacetimeDB
3. Optionally allow a text comment with the feedback
4. Visual indicator that feedback was given (so you don't double-vote)

## Implementation Notes

### Schema
Add a `message_feedback` table:
```rust
#[table(name = message_feedback, public)]
pub struct MessageFeedback {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub message_id: String,
    pub rating: i8,  // 1 = positive, -1 = negative
    pub comment: Option<String>,
    pub created_at: Timestamp,
}
```

### Frontend
Add feedback buttons in `message-row.tsx` for assistant messages:
```tsx
<div className="opacity-0 group-hover:opacity-100">
  <button onClick={() => rate(1)} aria-label="Good response">👍</button>
  <button onClick={() => rate(-1)} aria-label="Bad response">👎</button>
</div>
```

Call the SpacetimeDB reducer directly from the frontend.

## Resolution

_(fill in when resolving)_
