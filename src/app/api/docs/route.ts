import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createServer } from '@/lib/mcp/server'
import { config } from '@/lib/config'

interface OpenApiSpec {
  openapi: string
  info: object
  servers: object[]
  paths: Record<string, object>
}

let cachedSpec: OpenApiSpec | null = null

async function buildSpec(): Promise<OpenApiSpec> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()

  const server = createServer()
  await server.connect(serverTransport)

  const client = new Client({ name: 'docs-introspector', version: '0.1.0' })
  await client.connect(clientTransport)

  const [{ tools }, { resources }] = await Promise.all([
    client.listTools(),
    client.listResources(),
  ])

  await client.close()

  const paths: Record<string, object> = {}

  for (const tool of tools) {
    paths[`/tools/${tool.name}`] = {
      post: {
        operationId: tool.name,
        summary: tool.description ?? tool.name,
        tags: ['Tools'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: tool.inputSchema,
            },
          },
        },
        responses: {
          '200': { description: 'Tool result' },
        },
      },
    }
  }

  for (const resource of resources) {
    const safeName = resource.uri.replace(/[^a-zA-Z0-9]/g, '_')
    paths[`/resources/${safeName}`] = {
      get: {
        operationId: `read_${safeName}`,
        summary: resource.description ?? resource.name ?? resource.uri,
        tags: ['Resources'],
        parameters: [
          { name: 'uri', in: 'query', required: true, schema: { type: 'string', example: resource.uri } },
        ],
        responses: {
          '200': { description: 'Resource contents' },
        },
      },
    }
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'TalonPress MCP API',
      version: '0.1.0',
      description: 'Auto-generated schema from live MCP tool and resource definitions.',
    },
    servers: [{ url: config.publicBaseUrl, description: 'TalonPress' }],
    paths,
  }
}

export async function GET(): Promise<Response> {
  if (!cachedSpec) {
    cachedSpec = await buildSpec()
  }
  return new Response(JSON.stringify(cachedSpec, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  })
}
