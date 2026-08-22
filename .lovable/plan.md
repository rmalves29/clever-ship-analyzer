# Plan: Debugging ManyChat Flow (Instagram Automation)

The user is reporting that their ManyChat flows (Instagram automations) are not working when a comment is made. Logs indicate an error: `(#3) Application does not have the capability to make this API call.` for DM attempts, and there are no logs for comment replies.

## Analysis
- **Error (#3)**: This usually means the Meta App lacks necessary permissions/capabilities. Specifically, sending a DM to a user who commented requires `instagram_manage_messages`.
- **Missing Comment Replies**: The `sendFlowMessage` function in `src/lib/flow-engine.server.ts` uses the wrong endpoint/logic for public replies. It tries `/${ctx.commentId}/replies` with a `message` string, but Instagram API requires `/${comment_id}/replies?message=...` or a specific structure.
- **ManyChat Logic**: The current implementation tries to send a DM immediately when a comment is detected. Meta requires the `instagram_manage_messages` permission for the App and the Page must have given the App permission to manage messages.

## Proposed Changes

### 1. Fix Public Reply Logic
Correct the endpoint and parameters for responding to comments publicly on Instagram.

### 2. Improve Error Logging
Add more context to logs (like status codes and full error objects) to better diagnose "capability" issues.

### 3. Add Diagnostic View
Create a "Webhook & Connection Status" utility or update the ManyChat dashboard to show:
- If the Webhook is actually receiving events (verify `flow_webhook_events` counts).
- Verify which permissions are likely missing based on the error codes.

### 4. Code Adjustments
- Update `src/lib/flow-engine.server.ts` to handle `publicReply` correctly.
- Ensure `graphPOST` logs the full error response for better debugging.

## Technical Details
- **File**: `src/lib/flow-engine.server.ts`
  - Modify `sendFlowMessage` to use the correct `replies` endpoint.
  - Fix `graphPOST` to include the response body in the error message.
- **File**: `src/lib/flow.functions.ts` / `src/routes/flow/index.tsx`
  - Add a "Webhook Status" indicator.

## Verification Plan
1. Check the logs again after fix to see if public replies start working.
2. Provide a clear message to the user about which specific permissions they need to check in the Meta Developer Portal (`instagram_manage_messages`).
