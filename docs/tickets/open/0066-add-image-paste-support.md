# Add Image Paste Support in Chat Input

**Type:** feature
**Severity:** medium
**Component:** web, server
**Reported:** 2026-02-27

## Description

Users can't paste images into the chat input. Many LLM models (including Claude) support vision/image analysis, but the current input only accepts text. Users working with the AI on visual content (UI screenshots, diagrams, error screenshots) have to describe images in words.

## Expected Behavior

1. User can paste an image from clipboard (Ctrl/Cmd+V) into the chat input area
2. The image shows as a thumbnail preview in the input bar
3. On send, the image is uploaded and included in the message
4. The LLM receives the image as part of the conversation (via OpenRouter's multimodal API)
5. Images are displayed inline in the chat history

## Implementation Notes

### Frontend
1. Add a `paste` event listener on the textarea in `input-bar.tsx`
2. Check `event.clipboardData.files` for image types
3. Convert to base64 or upload to a temporary storage
4. Show a preview thumbnail in the input bar
5. Send the image data alongside the text message

### Server
1. Accept image data in the `/chat` endpoint (either as base64 in the JSON body or as multipart form data)
2. Include images in the OpenRouter request using the `image_url` content type in messages
3. Store image references in SpacetimeDB (as URLs or base64 in message_parts with a type field)

### Schema
Add a `content_type` field to `MessagePart` (default "text") to distinguish between text parts and image parts.

### Considerations
1. Image size limits (max 5MB per image)
2. Storage: base64 in SpacetimeDB is simple but increases DB size. External storage (R2, S3) is better long term.
3. Model compatibility: not all models support images; check model capabilities before sending.

## Resolution

_(fill in when resolving)_
