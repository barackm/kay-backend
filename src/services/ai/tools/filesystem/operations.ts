import { readdir, readFile } from "fs/promises";
import { join } from "path";

/**
 * Filesystem operations that allow AI to discover MCP server functions
 * by exploring the file structure and reading TypeScript files
 */

/**
 * List files and directories in a path
 * Security: Only allows listing within src/servers/
 */
export async function listDirectory(path: string): Promise<string[]> {
    const fullPath = join(process.cwd(), path);

    // Security: only allow src/servers/ directory
    if (!fullPath.includes("/src/servers/")) {
        throw new Error(
            "Access denied: can only list directories within src/servers/"
        );
    }

    const entries = await readdir(fullPath, { withFileTypes: true });

    return entries.map((entry) =>
        entry.isDirectory() ? `${entry.name}/` : entry.name
    );
}

/**
 * Read contents of a TypeScript file
 * Security: Only allows reading .ts files within src/servers/
 */
export async function readFileContent(path: string): Promise<string> {
    const fullPath = join(process.cwd(), path);

    // Security: only allow .ts files in src/servers/
    if (!fullPath.includes("/src/servers/") || !fullPath.endsWith(".ts")) {
        throw new Error(
            "Access denied: can only read .ts files within src/servers/"
        );
    }

    const content = await readFile(fullPath, "utf-8");
    return content;
}

/**
 * Execute TypeScript code in a controlled environment
 * The code has access to src/servers/* imports and kaySessionId
 */
export async function executeTypeScriptCode(
    code: string,
    kaySessionId: string
): Promise<string> {
    const { exec } = await import("child_process");
    const { promisify } = await import("util");
    const { writeFile, unlink } = await import("fs/promises");

    const execAsync = promisify(exec);

    // Create temp file with unique name
    const tempFile = join(process.cwd(), `temp-exec-${Date.now()}.ts`);
    console.log(`[Code Execution] Temp file: ${tempFile}`);
    console.log(`[Code Execution] Session ID: ${kaySessionId}`);

    // Wrap code to inject kaySessionId and proper imports
    const wrappedCode = `
// Auto-injected session ID
const kaySessionId = "${kaySessionId}";

// User's code
${code}
`;

    await writeFile(tempFile, wrappedCode);

    try {
        console.log(`[Code Execution] Executing with tsx...`);
        // Execute with tsx (supports TypeScript + ES modules)
        const { stdout, stderr } = await execAsync(`npx tsx ${tempFile}`, {
            timeout: 30000, // 30 second timeout
            cwd: process.cwd(),
            env: { ...process.env, NODE_ENV: "development" },
        });

        console.log(`[Code Execution] Stdout:`, stdout);
        if (stderr) console.log(`[Code Execution] Stderr:`, stderr);

        // Return combined output
        return stdout + (stderr ? `\nStderr: ${stderr}` : "");
    } catch (error) {
        console.error(`[Code Execution] Failed:`, error);
        // Return error message
        const errorMessage =
            error instanceof Error ? error.message : "Unknown error";
        throw new Error(`Code execution failed: ${errorMessage}`);
    } finally {
        // Cleanup temp file
        console.log(`[Code Execution] Cleaning up temp file`);
        await unlink(tempFile).catch(() => {
            /* ignore cleanup errors */
        });
    }
}
