# TalonPress: OpenTalon Web Publisher (MCP)

TalonPress is a lightweight, zero-dependency data publishing application built on Next.js. Operating as an extension for the **OpenTalon** agentic framework, it exposes a Model Context Protocol (MCP) interface that empowers autonomous agents to dynamically bundle, publish, and manage static web packages (HTML, CSS, JavaScript) with either public or token-gated private visibility.

---

## 🚀 Core Features

* **MCP-Native:** Designed from the ground up to be driven by LLM agents via standard MCP tool and resource protocols.
* **Zero-Dependency Architecture:** No external databases, object storage, or key-value stores required. Runs entirely on the local file system.
* **Query-Token Privacy:** Private packages are secured via unique, cryptographically secure tokens passed directly as query parameters, allowing seamless agent access and secure viewing without complex header injection.
* **Streamlined Next.js Edge:** Built utilizing the Next.js App Router for high-performance static asset streaming via dynamic filesystem routing.

---

## 📁 Storage Architecture

To maintain a strict zero-dependency footprint while ensuring data integrity and preventing race conditions, TalonPress uses a **Directory-per-Deployment Isolation** strategy coupled with an append-only transaction log (`jsonl`).

```text
.storage/
├── registry.jsonl               # Global append-only log for indexing & state recovery
└── deployments/
    ├── [package-id-or-slug]/
    │   ├── meta.json            # Deployment metadata (name, visibility, secure_token, hash)
    │   └── dist/                # Isolated static web assets
    │       ├── index.html
    │       ├── styles.css
    │       └── main.js

```

### Why This Approach?

* **Atomic Writes:** Agents write to a temporary directory and rename it atomically on the filesystem, preventing half-written deployments.
* **Metadata Resilience:** The `meta.json` file inside each deployment folder acts as the single source of truth for that package, storing its specific access configurations and security tokens.
* **Fast Indexing:** The `registry.jsonl` file allows high-speed startup indexing and audit trails without walking the entire directory tree on every request.

---

## 🔌 MCP Interface Specification

TalonPress exposes the following schema to the OpenTalon agentic framework.

### 🧰 Tools

Agents can execute actions using these schema-defined tools:

| Tool Name | Parameters | Description |
| --- | --- | --- |
| `publish_package` | `name` (string)<br>`visibility` (`"public"` &#124; `"private"`)<br>`files` (array of `{ path: string, content: string }`) | Compiles and publishes a new web package. Returns the deployment ID, base access URL, and a `secure_token` if private. |
| `list_packages` | `visibility` (optional string)<br>`limit` (optional integer) | Returns an array of available packages, their visibility status, and access URLs. |
| `get_package_status` | `package_id` (string) | Fetches the live status, route configuration, file manifest, and active tokens for a specific package. |
| `update_visibility` | `package_id` (string)<br>`visibility` (`"public"` &#124; `"private"`) | Modifies access permissions. Transitioning to `private` automatically generates a new secure token. |
| `update_package` | `package_id` (string)<br>`files` (array of `{ path: string, content: string }`) | Modifies or appends specific files within an existing deployment. Overwrites matching paths, leaves others untouched, and updates the `updatedAt` timestamp and build hash. |
| `delete_package` | `package_id` (string) | Purges the deployment directory and marks the package as deleted in the registry log. |

### 📂 Resources

Agents can read system state directly via these URIs:

* **`packages://list`**: A dynamically updated JSON list of all active packages. Useful for providing the agent with situational awareness of its published library.
* **`packages://{package_id}/meta`**: Returns the specific raw `meta.json` configuration, including access tokens for an individual package.

---

## 🛠️ Next.js Implementation Details

### Asset Serving & Token Validation

Public and private routing is handled natively via a Next.js dynamic catch-all route:

`app/pub/[packageId]/[[...path]]/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest, 
  { params }: { params: { packageId: string, path?: string[] } }
) {
  const { packageId, path } = params;
  
  // 1. Resolve package metadata from filesystem
  const meta = await getPackageMeta(packageId); 
  if (!meta) {
    return new NextResponse("Package Not Found", { status: 404 });
  }
  
  // 2. Enforce Privacy via Query Parameter Token
  if (meta.visibility === 'private') {
    const { searchParams } = new URL(request.url);
    const providedToken = searchParams.get('token');
    
    if (!providedToken || providedToken !== meta.secure_token) {
      return new NextResponse("Unauthorized: Invalid or missing token parameter.", { status: 401 });
    }
  }

  // 3. Resolve local file path safely (preventing directory traversal attacks)
  const safePath = resolveSafeFilePath(packageId, path);
  
  // 4. Stream file from the .storage directory with appropriate Content-Type
  return streamFileFromDisk(safePath);
}

```

---

## ⚙️ Configuration & Environment Variables

Configure TalonPress by creating a `.env.local` file in the root directory:

```env
# Server Configuration
PORT=3000
HOST=localhost

# Storage Paths (Defaults to .storage within the project directory if left blank)
STORAGE_DIR_PATH=/var/data/talonpress_storage

# Security
OPENTALON_SHARED_SECRET=your_high_entropy_mcp_token_here

```

---

## 🛠️ Getting Started

### Prerequisites

* Node.js v18.x or higher
* npm / pnpm / yarn

### Installation

1. Clone the repository into your OpenTalon ecosystem environment:
```bash
git clone [https://github.com/your-repo/talonpress.git](https://github.com/your-repo/talonpress.git)
cd talonpress

```


2. Install dependencies:
```bash
npm install

```


3. Run the development server:
```bash
npm run dev

```



### Connecting to OpenTalon

Add the TalonPress server configuration to your OpenTalon MCP settings file (e.g., `mcp-config.json`):

```json
{
  "mcpServers": {
    "talonpress": {
      "command": "node",
      "args": [".next/standalone/server.js"],
      "env": {
        "OPENTALON_SHARED_SECRET": "your_high_entropy_mcp_token_here",
        "STORAGE_DIR_PATH": "./.storage"
      }
    }
  }
}

```

---

## 🔒 Security Considerations

> [!WARNING]
> * **Token Leakage:** Passing security tokens via query parameters (`?token=...`) makes distribution simple for agents, but means tokens can appear in browser histories or server access logs. Ensure your environment logs strip query strings for private package endpoints.
> * **Sandboxing:** Because this application serves arbitrary HTML/JS provided by autonomous agents, ensure that the serving domain is isolated or sandboxed (e.g., utilizing unique subdomains or rigid Content Security Policies) to prevent Cross-Site Scripting (XSS) risks to the parent OpenTalon management console.
> 
> 

```