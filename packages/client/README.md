# @talonpress/mcp-tools

[Vercel AI SDK](https://sdk.vercel.ai) tool definitions for the [TalonPress](https://talonpress.com) MCP API.

Wires the TalonPress MCP endpoint into a Vercel AI SDK `ToolSet`, so an agent can publish static web packages from a local folder, list them, inspect status, change visibility, and delete them.

## Install

```sh
npm install @talonpress/mcp-tools
```

Peer dependencies (provide your own):

```sh
npm install ai zod
```

| Peer  | Version    |
| ----- | ---------- |
| `ai`  | `>=4.0.0`  |
| `zod` | `>=4.0.0`  |

## Quick start

```ts
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { getTalonpressTools } from '@talonpress/mcp-tools';

const tools = getTalonpressTools({
  url: 'https://your-talonpress-host/api/mcp',
  // transport: 'streamable-http', // default; 'sse' also supported
  headers: { Authorization: `Bearer ${process.env.TALONPRESS_TOKEN}` },
});

const { text } = await generateText({
  model: openai('gpt-4o'),
  tools,
  maxSteps: 10,
  prompt: 'Publish the ./site folder to TalonPress as "My Docs".',
});
```

## API

### `getTalonpressTools(cfg, workspaceDir?)`

Returns a Vercel AI SDK `ToolSet` wired to `cfg`.

- `cfg: TalonpressConfig` — endpoint configuration.
- `workspaceDir?: string` — base for resolving relative `folder` paths in `talonpress_publish`. Defaults to `process.cwd()`.

### `TalonpressConfig`

| Field       | Type                          | Default             | Notes                                              |
| ----------- | ----------------------------- | ------------------- | -------------------------------------------------- |
| `url`       | `string`                      | —                   | Full URL of the TalonPress MCP endpoint.           |
| `transport` | `'sse' \| 'streamable-http'`  | `'streamable-http'` | Transport protocol.                                |
| `headers`   | `Record<string, string>`      | —                   | Headers forwarded on every MCP request (e.g. auth).|

The underlying MCP client is created lazily and cached per `url`+`headers`; on any tool error the cache resets so the next call reconnects.

## Tools

| Tool                            | Purpose                                                                 |
| ------------------------------- | ----------------------------------------------------------------------- |
| `talonpress_publish`            | Publish or update a static web package by uploading files from a folder.|
| `talonpress_list_packages`      | List packages with visibility and access URLs.                          |
| `talonpress_get_package_status` | Fetch live status, routes, file manifest, and active tokens.            |
| `talonpress_update_visibility`  | Change package visibility (→ private mints a new secure token).         |
| `talonpress_delete_package`     | Permanently delete a package and purge its files.                       |

### `talonpress_publish`

Two-phase by design:

1. **Dry run** — call without `files`. The tool lists what it *would* publish (no upload), so the agent can review a folder that may hold leftovers.
2. **Publish** — call again with `files` listing the exact paths (each a file or subdirectory, recursive). Use `files: ["."]` to publish the whole folder.

Other notes:

- Omit `package_id` to create; provide it to update (overwrites matching paths).
- `default_page` (e.g. `index.html`) must be among the selected files — served at the package root.
- Text and binary files are detected and encoded automatically.
- Large publishes stream via an upload session in chunks (~15 MB content each), keeping peak memory to roughly one chunk.
- Skipped directories: `.git`, `node_modules`, `.next`, `dist`, `build`.

## License

MIT
