# AI Tool Calling Issues & Fixes

## Problem Summary

The AI was not reliably performing **write actions** (updates, creates, transitions) in Jira and other services. Read operations worked fine, but when asked to update or create items, the AI would often fail to execute the actions or would only execute them partially.

## Root Causes Identified

### 1. **Single-Round Tool Calling Limitation** ⭐ CRITICAL

**Problem**: The original implementation only allowed ONE round of tool execution:
```
User Request → AI calls tool → Tool executes → AI responds → END
```

**Why This Breaks Updates**:
- AI can't verify the action succeeded
- Can't handle multi-step workflows (e.g., search → get ID → update)
- Can't retry on validation errors
- Can't call subsequent tools based on previous results

**Example Failure**:
```
User: "Update issue ABC-123 to In Progress"

OLD BEHAVIOR:
1. AI calls jira_transition_issue with wrong status ID
2. Tool returns error "Invalid status"
3. AI never sees the error
4. Returns generic response without actually updating

NEW BEHAVIOR:
1. AI calls jira_get_issue to verify issue exists
2. AI calls jira_get_transitions to see valid transitions
3. AI calls jira_transition_issue with correct status ID
4. Tool returns success
5. AI confirms "Issue ABC-123 updated to In Progress"
```

### 2. **No Multi-Step Workflows**

**Problem**: Complex operations require multiple sequential tool calls:
- Get the issue key → Update the issue
- Search for issues → Get latest one → Add comment
- Verify credentials → Create resource → Set permissions

Without multi-round calling, the AI could only do step 1 and then stop.

### 3. **Weak System Prompt**

**Problem**: The original prompt didn't explicitly instruct the AI to:
- Use tools proactively for write operations
- Call multiple tools in sequence
- Verify actions succeeded
- Handle errors and retry

This led to the AI being passive and not taking initiative to complete actions.

### 4. **Streaming Mode Doesn't Feed Results Back**

**Problem**: In streaming mode (`interactive=true`), tool results are sent to the client but NOT back to the AI.

This means:
- AI can't see if the tool succeeded or failed
- AI can't take follow-up actions
- AI can't provide accurate confirmation messages

**Recommendation**: Use non-streaming mode (`interactive=false`) for action-oriented requests.

### 5. **Context Overflow with Large Tool Results**

**Problem**: Some Jira API responses can be very large (thousands of characters with all fields). Sending these verbatim can:
- Exceed token limits
- Slow down responses
- Waste tokens on irrelevant data

## Solutions Implemented

### ✅ 1. Multi-Round Tool Calling Loop

**File**: `src/services/ai/chat.ts`

Implemented an iterative loop that allows up to 5 rounds of tool calling:

```typescript
while (iteration < MAX_ITERATIONS) {
  // 1. AI decides what tools to call (or to stop)
  const completion = await openai.chat.completions.create(...)

  // 2. If no tool calls, we're done
  if (!assistantMessage.tool_calls) {
    return final response
  }

  // 3. Execute all tool calls
  for (const toolCall of assistantMessage.tool_calls) {
    const result = await callMcpTool(...)
    toolResults.push(result)
  }

  // 4. Add results to conversation and loop
  currentMessages = [...currentMessages, assistant_msg, ...toolResults]
  // Loop continues - AI sees results and can call more tools
}
```

**Benefits**:
- AI can chain multiple tool calls
- AI sees tool results and can react to errors
- Supports complex multi-step workflows
- Prevents infinite loops with MAX_ITERATIONS limit

### ✅ 2. Enhanced System Prompt

**File**: `src/services/ai/prompts.ts`

Added explicit instructions:

```
IMPORTANT INSTRUCTIONS:
1. ALWAYS use tools proactively when users ask you to perform actions
2. For write operations, ALWAYS:
   - Use the tool to perform the action
   - Wait for the tool result to confirm success
   - If successful, confirm what was done with specific details
3. You can call multiple tools in sequence
4. Use one tool's results to inform the next tool call
```

Also added concrete examples:
```
- "Update issue XYZ to in progress" →
  Call get_issue to verify →
  Call transition_issue with correct status
```

### ✅ 3. Result Truncation

**File**: `src/services/ai/chat.ts:295-303`

Large tool results (>4000 chars) are now truncated:

```typescript
let resultContent = JSON.stringify(result);
if (resultContent.length > 4000) {
  resultContent = resultContent.substring(0, 4000) + "... [truncated]";
}
```

This prevents context overflow while still providing enough information for the AI to understand what happened.

### ✅ 4. Better Logging

Added detailed logging at each step:
- Which iteration we're on
- How many tool calls are being made
- Which tools are being called
- When results are truncated
- When we exit the loop and why

## Expected Behavior Now

### Simple Update
```
User: "Update issue ABC-123 description to 'New description'"

AI Flow:
Iteration 1:
  → Calls jira_update_issue(key="ABC-123", fields={description: "New description"})
  → Tool returns: {success: true, key: "ABC-123"}
  → No more tool calls needed

Response: "I've updated the description of issue ABC-123 to 'New description'."
```

### Complex Multi-Step
```
User: "Add a comment to my latest bug"

AI Flow:
Iteration 1:
  → Calls jira_search_issues(jql="type=Bug ORDER BY created DESC", maxResults=1)
  → Tool returns: {issues: [{key: "ABC-456", ...}]}
  → Needs to call another tool

Iteration 2:
  → Calls jira_add_comment(issueKey="ABC-456", body="Comment text")
  → Tool returns: {success: true, commentId: "12345"}
  → No more tool calls needed

Response: "I've added a comment to issue ABC-456 (your latest bug)."
```

### Error Handling
```
User: "Transition issue ABC-789 to Done"

AI Flow:
Iteration 1:
  → Calls jira_transition_issue(issueKey="ABC-789", transitionId="31")
  → Tool returns: {error: "Invalid transition ID"}
  → Needs to fix the error

Iteration 2:
  → Calls jira_get_transitions(issueKey="ABC-789")
  → Tool returns: {transitions: [{id: "41", name: "Done"}]}
  → Found correct ID

Iteration 3:
  → Calls jira_transition_issue(issueKey="ABC-789", transitionId="41")
  → Tool returns: {success: true}
  → No more tool calls needed

Response: "Issue ABC-789 has been transitioned to Done."
```

## Testing Recommendations

### Test Cases for Jira Updates

1. **Simple Update**
   ```
   "Update issue ABC-123 summary to 'Test summary'"
   Expected: Issue updated, AI confirms with issue key
   ```

2. **Multi-Step Workflow**
   ```
   "Add a comment to the latest ticket in project XYZ"
   Expected: AI searches, finds issue, adds comment, confirms
   ```

3. **Error Recovery**
   ```
   "Transition issue to InvalidStatus"
   Expected: AI tries, gets error, searches valid statuses, asks user OR retries with valid status
   ```

4. **Create and Update**
   ```
   "Create a bug titled 'Login broken' and assign it to me"
   Expected: AI creates issue, then assigns it (2 tool calls)
   ```

5. **Conditional Actions**
   ```
   "If issue ABC-123 is still open, close it"
   Expected: AI gets issue, checks status, conditionally transitions
   ```

### Non-Streaming Mode for Actions

For requests that involve write operations, use non-streaming mode:

```bash
POST /ask?interactive=false
{
  "message": "Update issue ABC-123 to In Progress"
}
```

For read-only requests, streaming still works well:

```bash
POST /ask?interactive=true
{
  "message": "What are my recent Jira tickets?"
}
```

## Performance Considerations

### Token Usage
- Each iteration costs tokens for the full conversation history
- 5 iterations max means worst case is 5x the token cost
- Truncating results at 4000 chars helps control costs
- Most requests complete in 1-2 iterations

### Response Time
- Each iteration adds ~1-3 seconds (depending on OpenAI API latency)
- Complex workflows might take 5-10 seconds total
- Still much better than the previous behavior (which didn't work at all)

### Optimization Tips
1. Use specific, clear requests to minimize iterations
2. Consider reducing MAX_ITERATIONS to 3 for faster responses (trade-off: might fail complex workflows)
3. Monitor logs to see average iteration counts
4. Adjust result truncation threshold if needed

## Configuration

### Adjustable Parameters

In `src/services/ai/chat.ts`:

```typescript
const MAX_ITERATIONS = 5;  // Increase for more complex workflows, decrease for speed
const TRUNCATE_THRESHOLD = 4000;  // Chars before truncating tool results
```

## Additional Notes

### Why Not Parallel Tool Calls?

The current implementation executes tool calls sequentially within each iteration. OpenAI's API supports parallel tool calls in a single turn, but we execute them one-by-one.

**Pros of Sequential**:
- Simpler error handling
- Easier to debug
- Tool calls can depend on each other

**Cons**:
- Slightly slower for independent operations

If parallel execution is needed, the code can be updated to use `Promise.all()` for independent tool calls within the same iteration.

### Streaming Mode Limitations

Streaming mode still has the limitation that tool results aren't fed back to the AI. This is a fundamental architectural decision.

**Options**:
1. Keep non-streaming for actions (current recommendation)
2. Implement a hybrid: stream text but batch tool calls
3. Use Server-Sent Events to stream AND provide feedback loop

## Monitoring

Watch for these log patterns to diagnose issues:

```
[Chat] Tool calling iteration X/5  // Normal iteration count
[Chat] Processing N tool call(s)   // How many tools per iteration
[Chat] No tool calls, finishing    // AI decided to stop (good)
[Chat] Reached max iterations      // Hit the limit (might need tuning)
[Chat] Tool result truncated       // Large response was truncated
```

If you see "Reached max iterations" frequently, either:
- Increase MAX_ITERATIONS
- Improve the system prompt
- Check for tool errors causing retry loops
