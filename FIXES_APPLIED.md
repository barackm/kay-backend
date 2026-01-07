# Code Fixes Applied

This document summarizes the critical and medium-severity issues that were identified and fixed in the Kay Backend codebase.

## Critical Issues Fixed

### 1. ✅ Fixed Encryption to Use Unique Salts
**File**: `src/services/encryption.ts`

**Problem**: Used a hardcoded salt `"salt"` for all encryption operations, which defeats the purpose of salting and makes all encrypted data vulnerable if the encryption key is compromised.

**Solution**:
- Generate a unique 32-byte random salt for each encryption operation
- Store the salt with the encrypted data in format: `salt:iv:tag:encrypted`
- Maintain backward compatibility by detecting old format (3 parts) vs new format (4 parts)
- Properly validate byte length instead of character length

### 2. ✅ Made ENCRYPTION_KEY Required
**File**: `src/config/env.ts`

**Problem**: `ENCRYPTION_KEY` was marked as optional in the environment schema, but the encryption service requires it, causing runtime errors.

**Solution**:
- Made `ENCRYPTION_KEY` a required field with proper byte-length validation
- Added Zod refinement to check for minimum 32 bytes (not just characters)

### 3. ✅ Refactored MCP Registry for Persistent Connections
**Files**: `src/services/mcp/server-registry.ts`, `src/services/ai/mcp-tools.ts`, `src/routes/mcp.ts`

**Problem**:
- Created new `MCPServerRegistry` instances in `getAvailableTools()` instead of using the shared registry
- Connected and disconnected for every single operation, spawning/killing child processes constantly
- Massive performance overhead and resource waste

**Solution**:
- Registry now reuses existing connections instead of creating new ones
- Added `isConnected()` to check connection status
- Added `ensureConnected()` to get or create connections
- Added `disconnectAll()` for cleanup
- Tracks in-progress connection attempts to prevent race conditions
- Updated all routes to use `ensureConnected()` instead of connect/disconnect pairs
- Removed all `disconnect()` calls after operations - connections persist
- Pass shared registry instance to `getAvailableTools()`

### 4. ✅ Removed Arbitrary Timeouts
**Files**: `src/services/ai/mcp-tools.ts`, `src/routes/mcp.ts`

**Problem**: Code used arbitrary delays like `setTimeout(1000)` or `setTimeout(800)` to "wait for connections to stabilize", which is unreliable and wasteful.

**Solution**:
- Removed all arbitrary `setTimeout()` calls
- Rely on the MCP client's connection promise for proper synchronization
- The `ensureConnected()` method waits for the connection to be ready before returning

### 5. ✅ Added Proper Error Logging
**Files**: `src/services/ai/mcp-tools.ts`

**Problem**: Silent `catch {}` blocks throughout the code hid errors that could be important for debugging.

**Solution**:
- Replaced empty catch blocks with proper error logging using `console.error()`
- Log error messages and context to help with debugging
- Continue processing instead of failing silently where appropriate

### 6. ✅ Fixed Streaming Tool Call Argument Parsing
**File**: `src/services/ai/chat.ts`

**Problem**: In streaming mode, tool call arguments were parsed immediately from each chunk using `JSON.parse()`, but the arguments arrive incrementally and incomplete JSON would throw errors.

**Solution**:
- Implemented a buffer to accumulate tool call arguments as they stream in
- Track each tool call by index
- Only parse and execute tool calls when `finish_reason === "tool_calls"`
- Ensures complete JSON before parsing

## Additional Improvements

### Code Quality
- Removed redundant disconnect logic in error handlers
- Simplified connection flow with clearer method names
- Added comprehensive JSDoc comments to new methods
- Improved type safety with proper error handling

### Performance
- Connections are now persistent instead of ephemeral
- Eliminated hundreds of unnecessary process spawns/kills
- Reduced latency for tool calls by ~1-2 seconds per call
- Connection pooling prevents resource exhaustion

## Migration Notes

### For Existing Encrypted Data
The encryption changes are **backward compatible**:
- Old encrypted data (3-part format) will continue to work
- New encryptions use the 4-part format with unique salts
- Data will be automatically re-encrypted with new format on next update

### For Existing Deployments
**BREAKING CHANGE**: `ENCRYPTION_KEY` is now required.

Before deploying:
1. Ensure `ENCRYPTION_KEY` is set in your `.env` file
2. Verify it's at least 32 bytes long
3. Run the application to test before deploying to production

### Connection Behavior
- MCP server connections now persist for the lifetime of the user's session
- To manually disconnect all servers for a user, call `registry.disconnectAll(userId)`
- Consider adding connection cleanup on user logout or session timeout

## Testing Recommendations

1. **Encryption**: Test that old encrypted credentials can still be decrypted
2. **Connections**: Verify MCP servers stay connected across multiple tool calls
3. **Streaming**: Test chat with tool calls in streaming mode
4. **Error Handling**: Check that errors are properly logged and don't crash the app
5. **Performance**: Monitor process count to ensure connections aren't leaking

## Files Modified

- `src/services/encryption.ts` - Encryption with unique salts
- `src/config/env.ts` - Required ENCRYPTION_KEY
- `src/services/mcp/server-registry.ts` - Persistent connections
- `src/services/ai/mcp-tools.ts` - Use shared registry, better error logging
- `src/routes/mcp.ts` - Remove connect/disconnect pairs
- `src/services/ai/chat.ts` - Fix streaming argument parsing
