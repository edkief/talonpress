import type { ToolSet } from 'ai';
export interface TalonpressConfig {
    /** Full URL of the TalonPress MCP endpoint. */
    url: string;
    /** Transport protocol (default: streamable-http). */
    transport?: 'sse' | 'streamable-http';
    /** Optional headers forwarded to every MCP request (e.g. Authorization). */
    headers?: Record<string, string>;
}
/**
 * Returns a Vercel AI SDK ToolSet with all TalonPress tools wired to the given
 * config. Pass `workspaceDir` to resolve relative `folder` paths; defaults to
 * `process.cwd()`.
 */
export declare function getTalonpressTools(cfg: TalonpressConfig, workspaceDir?: string): ToolSet;
//# sourceMappingURL=index.d.ts.map