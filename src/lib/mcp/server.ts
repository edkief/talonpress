import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerTools } from './tools'
import { registerResources } from './resources'

/** Register all tools and resources onto an existing McpServer instance. */
export function setupServer(server: McpServer): void {
  registerTools(server)
  registerResources(server)
}

/** Create and populate a standalone McpServer (useful for testing). */
export function createServer(): McpServer {
  const server = new McpServer({
    name: 'talonpress',
    version: '0.1.0',
  })
  setupServer(server)
  return server
}
