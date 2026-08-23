# Plan: Fix WhatsApp Media and Automation Logs

## Problem
1. **Unwanted Media Attachments**: WhatsApp messages were being sent with an unwanted image even when no media was selected. The server was sending a media component with a placeholder or empty URL.
2. **Missing Campaign/Flow Logs**: Some automated messages (especially in ManyChat/Flows) were not being properly logged as sent/delivered, and stats were missing.
3. **Disruptive Analysis**: The user requested a more "disruptive" and definitive fix for recurring issues.

## Proposed Changes

### 1. WhatsApp Server Functions (`src/lib/whatsapp-meta.server.ts`)
- **Strict Media Validation**: Modify `sendTemplateMessage` to explicitly skip the `header` component if `mediaUrl` is not a valid absolute URL (starting with `http`).
- **Media Type Detection**: Improve media type detection to ensure it doesn't default to "image" when it shouldn't.
- **Improved Logging**: Add robust logging for every WhatsApp API call result to ensure we can trace delivery issues.

### 2. WhatsApp Send Dialog (`src/components/whatsapp/WhatsappSendDialog.tsx`)
- **Placeholder Cleanup**: Ensure that when a user doesn't select an image, the `mediaUrl` passed to the server is `undefined` or `null`, not a placeholder string.
- **UI Clarification**: Add a small indicator showing if a media header is active for the selected template.

### 3. Campaign Dispatch Logic (`src/lib/whatsapp-meta.server.ts`)
- **Fix Template Parameter Mapping**: Ensure that `bodyParams` are correctly mapped even in automated flows.
- **Enhanced Recipient Logging**: Ensure `whatsapp_campaign_recipients` entries are created for every single message sent, including those from flows, to fix the "0 metrics" issue.

## Technical details
- The `sendTemplateMessage` function will now check `if (params.mediaUrl?.startsWith('http') || params.mediaId)` before adding the `header` component.
- The `dispatchCampaign` loop will be updated to handle errors more gracefully and ensure database logs are persisted even if one recipient fails.
- We will add a check in `src/lib/whatsapp-meta.server.ts` to prevent sending empty media components.
