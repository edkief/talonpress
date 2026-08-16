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
| `publish_package` | `name` (string)<br>`visibility` (`"public"` &#124; `"private"`)<br>`files` (array of `{ path: string, content: string, encoding?: "utf8" \| "base64" }`)<br>`default_page` (string) | Compiles and publishes a new web package. Returns the deployment ID, base access URL, and a `secure_token` if private. `default_page` must be a path present in `files`. |
| `list_packages` | `visibility` (optional string)<br>`limit` (optional integer) | Returns an array of available packages, their visibility status, and access URLs. |
| `get_package_status` | `package_id` (string) | Fetches the live status, route configuration, file manifest, and active tokens for a specific package. |
| `update_visibility` | `package_id` (string)<br>`visibility` (`"public"` &#124; `"private"`) | Modifies access permissions. The existing `secure_token` is preserved across toggles — only a fresh package (no token yet) gets one on going private. Use `renew_token` to explicitly rotate a token that has leaked. |
| `update_package` | `package_id` (string)<br>`files` (array of `{ path: string, content: string, encoding?: "utf8" \| "base64" }`)<br>`default_page` (optional string) | Modifies or appends specific files within an existing deployment. Overwrites matching paths, leaves others untouched, and updates the `updatedAt` timestamp and build hash. If `default_page` is provided it must exist in the resulting merged file set. |
| `delete_package` | `package_id` (string) | Purges the deployment directory and marks the package as deleted in the registry log. |
| `renew_token` | `package_id` (string) | Rotates the `secure_token` of a private package and updates `tokenGeneratedAt`. Anyone holding the previous token loses access. Package must be private. |

### 📂 Resources

Agents can read system state directly via these URIs:

* **`packages://list`**: A dynamically updated JSON list of all active packages. Useful for providing the agent with situational awareness of its published library.
* **`packages://{package_id}/meta`**: Returns the specific raw `meta.json` configuration, including access tokens for an individual package.

---

## 🛠️ Next.js Implementation Details

### Asset Serving & Token Validation

Public and private routing is handled natively via a Next.js dynamic catch-all route:

`app/pub/[packageId]/[[...path]]/route.ts`

The route enforces a two-tier access check for private packages:

1. **Session cookie (`tp_pkg_session`)** — if the browser already holds a valid per-package session, access is granted immediately without re-presenting the token.
2. **Query token (`?token=`)** — if no valid session is found, the token in the URL is validated against `meta.secure_token`. On success, a `tp_pkg_session` cookie is issued and the request proceeds, so the token is no longer needed for subsequent page loads within the session.

Bare package root requests (`/pub/<id>`) are redirected to `/pub/<id>/` to ensure relative asset paths resolve correctly.

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
TALONPRESS_SHARED_SECRET=your_high_entropy_mcp_token_here

# Session & Auth
AUTH_SESSION_TTL=3600          # Dashboard auth session cookie lifetime in seconds (default: 3600)
PUBLIC_BASE_URL=https://your.domain.com  # Used to construct package URLs and set the Secure cookie flag

# authz-proxy (reverse proxy mode) — see "Authentication Behaviour" below
AUTHZ_PROXY_URL=https://authz-proxy.example.com
TALONPRESS_ADMIN_ROLE=talonpress-admin   # External role granting management access
AUTHZ_ROLE_SOURCE=jwt                    # 'jwt' (verify) | 'header' (trust proxy headers)
TALONPRESS_MCP_AUTH=inherit              # 'inherit' | 'none' (opt /api/mcp out of the gate)

# Suppress the startup warning when no auth mechanism is configured
TALONPRESS_DISABLE_AUTH_WARNING=true

# OpenTalon agent chat — see "Agent Chat" below. Requires auth to be configured.
TALONPRESS_AGENT_URL=https://opentalon.example.com
TALONPRESS_AGENT_SECRET=your_embed_channel_secret
TALONPRESS_AGENT_TIMEOUT_MS=15000          # Non-streaming calls only
TALONPRESS_AGENT_MAX_CONTEXT_CHARS=4000    # Budget for the page-context block
```

### Authentication Behaviour

TalonPress supports two complementary mechanisms. They are OR-ed — whichever recognises the caller wins — and the app is only fully open when **neither** is configured.

#### Route map

The management surface lives entirely under `/admin`, so the protected set is one prefix plus the API, rather than a list to keep in sync:

| Path | Access |
| --- | --- |
| `/admin`, `/admin/packages`, `/admin/packages/<id>` | Admin only |
| `/api/*` | Admin only, except the four below |
| `/` | Public landing page |
| `/auth`, `/api/auth` | Public — the shared-secret sign-in |
| `/api/health` | Public — liveness probes |
| `/api/mcp` | Authenticated in the handler (see `TALONPRESS_MCP_AUTH`) |
| `/pub/*`, `/api/pub/*` | Public, or token-gated per package |
| `/api/pub/*/agent/*` | Admin only — enforced in the handler, not the proxy |

Browsers denied at `/admin` are redirected: to `/auth` when shared-secret login is available, otherwise to `/` where the landing page names the role they are missing. Non-browser clients get `401`/`403` JSON instead.

#### 1. authz-proxy (`AUTHZ_PROXY_URL`) — human identity

TalonPress runs *behind* [authz-proxy](https://npm.kieffer.me/-/web/detail/@authz-proxy/sdk) in reverse proxy mode. The proxy authenticates the user and forwards the request with `X-Auth-Request-*` headers, including a signed RS256 JWT in `X-Auth-Request-JWT`. [`@authz-proxy/sdk`](https://npm.kieffer.me/-/web/detail/@authz-proxy/sdk) verifies that token locally against the proxy's JWKS, giving TalonPress the user's **display name** and **external role list**. The proxy must run with `JWT_ASYMMETRIC_SIGNING=true`.

| Outcome | Condition |
| --- | --- |
| Full management access | User holds `TALONPRESS_ADMIN_ROLE` (default `talonpress-admin`) |
| `403 Forbidden` | Authenticated upstream but missing that role — the response names the role required |
| `401 Unauthorized` | No identity forwarded (and no shared secret configured) |

The signed-in user's name and roles are shown in the dashboard sidebar. Only `X-Auth-Request-JWT` is consulted as a token source, so a `Bearer <shared secret>` header can never shadow the proxy identity. If the proxy or its JWKS is unreachable, TalonPress degrades to "no authz identity" rather than failing the request — the shared secret remains a way in.

Set `AUTHZ_ROLE_SOURCE=header` to skip JWT verification and trust `X-Auth-Request-Email` / `X-Auth-Request-Role-List` directly. This needs no JWKS, but is **only safe when the proxy is the sole ingress** and strips client-supplied copies of those headers; it also carries no display name, only the email.

#### 2. `TALONPRESS_SHARED_SECRET` — machine credential

MCP clients and CLI automation cannot complete an interactive sign-in, so the shared secret remains a full-access credential, sent as `Authorization: Bearer <secret>`. It also backs the `/auth` login page and the HMAC-signed session cookies:

| Cookie | Scope | Purpose |
| --- | --- | --- |
| `tp_session` | `/` | Dashboard session. Issued by the login endpoint after the shared secret is verified. |
| `tp_pkg_session` | `/pub` | Per-package access for private packages. Carries a map of `packageId → expiry` timestamps. |

On the first visit to a private package URL with a valid `?token=` query parameter, TalonPress promotes the token to a `tp_pkg_session` cookie so subsequent requests in the same browser session no longer need to pass the token in the URL.

#### 3. `TALONPRESS_MCP_AUTH` — opting the MCP transport out

In a typical cluster deployment the two classes of traffic arrive by different routes: browsers come through the public hostname ingress (authz-proxy-protected), while MCP clients reach the pod over an internal Kubernetes Service — carrying no proxy headers and no shared secret. Because `/api/mcp` otherwise inherits the app-wide gate, enabling authz-proxy would start returning `401` to those in-cluster callers.

`TALONPRESS_MCP_AUTH=none` opts the MCP transport out of the gate, and only that transport. `/admin`, `/api/packages/cleanup`, and every other route stay gated exactly as before.

| Value | Effect on `/api/mcp` |
| --- | --- |
| `inherit` (default) | Gated by whatever auth is configured — shared secret and/or authz-proxy admin role. |
| `none` | Accepts unauthenticated requests. Announced at startup with a warning log. |

**The precondition:** `none` assumes every non-cluster route to the pod terminates at authz-proxy first. In this deployment the public hostname ingress is authz-proxy-protected, so MCP is properly gated externally. The residual exposure is lateral — anything that can reach the pod's port from inside the cluster can publish and delete packages — which is a NetworkPolicy question rather than an application one.

That assumption is load-bearing. If a second ingress is added, or someone runs `kubectl port-forward` to the pod, `/api/mcp` becomes an unauthenticated write path. Confirm too that authz-proxy's route matching actually covers `/api/mcp` and does not exclude `/api/*` on the assumption that the application authenticates its own API routes — with `none` set, it does not.

#### Choosing a combination

| `AUTHZ_PROXY_URL` | `TALONPRESS_SHARED_SECRET` | Result |
| --- | --- | --- |
| ✓ | ✓ | **Recommended.** Humans get named, role-checked access; MCP/CLI keep a bearer credential. |
| ✓ | — | Fully proxy-governed. MCP clients must also route through the proxy and hold the admin role. |
| — | ✓ | Legacy behaviour: one shared token for everyone, no identity. |
| — | — | No access control. The dashboard shows a warning banner. |

> [!NOTE]
> When only authz-proxy is configured there is no shared secret to sign cookies with, so `tp_pkg_session` is signed with a random per-process key. Package sessions therefore reset on restart; a `?token=` link re-grants them immediately.

---

## 🛠️ Getting Started

### Prerequisites

* Node.js v18.x or higher
* pnpm (`npm install -g pnpm`)

### Installation

1. Clone the repository into your OpenTalon ecosystem environment:
```bash
git clone https://github.com/your-repo/talonpress.git
cd talonpress
```

2. Install dependencies:
```bash
pnpm install
```

3. Run the development server:
```bash
pnpm dev
```



### Connecting to OpenTalon

TalonPress exposes a **Streamable HTTP** MCP endpoint at `/api/mcp`. Point your MCP client at the running server's URL. With authentication enabled, pass the shared secret as a Bearer token:

```json
{
  "mcpServers": {
    "talonpress": {
      "url": "http://localhost:3000/api/mcp",
      "headers": {
        "Authorization": "Bearer your_high_entropy_mcp_token_here"
      }
    }
  }
}
```

> [!NOTE]
> SSE transport (`/api/sse`) is disabled. Only the stateless Streamable HTTP transport is supported.

---

## 📦 Client Package: `@talonpress/mcp-tools`

`packages/client` ships a **Vercel AI SDK** `ToolSet` that wraps the TalonPress MCP API for use inside AI agents built with the `ai` package.

### Installation

```bash
pnpm add @talonpress/mcp-tools
```

Peer dependencies: `ai >= 4.0.0`, `zod >= 4.0.0`.

### Usage

```ts
import { getTalonpressTools } from '@talonpress/mcp-tools';

const tools = getTalonpressTools({
  url: 'http://localhost:3000/api/mcp',
  headers: { Authorization: 'Bearer your_secret' },
});

// Pass `tools` to any Vercel AI SDK `generateText` / `streamText` call.
```

### Available Tools

| Tool | Description |
| --- | --- |
| `talonpress_publish` | Publish or update a package by uploading selected files from a local folder. Omit `files` for a dry-run preview. Pass `package_id` to update an existing package. |
| `talonpress_list_packages` | List packages with optional `visibility` filter and `limit`. |
| `talonpress_get_package_status` | Fetch full status, file manifest, and tokens for a package. |
| `talonpress_update_visibility` | Change a package's visibility. The existing token is preserved across toggles. |
| `talonpress_renew_token` | Rotate a private package's `secure_token` (use when a token has leaked). |
| `talonpress_delete_package` | Permanently delete a package. |

The `talonpress_publish` tool handles text and binary files automatically (binary files are base64-encoded), walks subdirectories recursively, and skips common noise directories (`.git`, `node_modules`, `.next`, `dist`, `build`).

---

## 🐳 Docker Deployment

A multi-stage `Dockerfile` is included. It installs dependencies, builds the Next.js standalone output, and produces a minimal production image.

```bash
# Build the image locally
docker build -t talonpress .

# Run with required environment variables
docker run -p 3000:3000 \
  -e TALONPRESS_SHARED_SECRET=your_secret \
  -e PUBLIC_BASE_URL=https://your.domain.com \
  -v /var/data/talonpress_storage:/app/.storage \
  talonpress
```

### build.sh

`build.sh` automates tagging and pushing images to a registry using the current git commit:

```bash
# Tag as <branch>-<short-hash> and push
./build.sh hash

# Tag with a timestamp (manual builds)
./build.sh ts
```

---

## ☸️ Kubernetes Deployment

Sample manifests are provided in the [`k8s/`](k8s/) directory and managed via Kustomize:

| File | Purpose |
| --- | --- |
| `namespace.yaml` | Dedicated `talonpress` namespace |
| `pvc.yaml` | PersistentVolumeClaim for `.storage` |
| `deployment.yaml` | Two-replica deployment with liveness/readiness probes |
| `service.yaml` | ClusterIP service on port 3000 |
| `ingress.yaml` | Ingress rule (update host and TLS config for your cluster) |
| `kustomization.yaml` | Kustomize entry point |

Apply everything with:

```bash
kubectl apply -k k8s/
```

> [!NOTE]
> The sample deployment uses `registry.kieffer.me/talonpress:latest`. Update the `image:` field in `k8s/deployment.yaml` and add your registry credentials (`imagePullSecrets`) before deploying to your own cluster. Environment variables (`TALONPRESS_SHARED_SECRET`, `PUBLIC_BASE_URL`) should be injected via a Kubernetes Secret rather than hardcoded in the manifest.

### Health endpoint

`GET /api/health` returns `{"status":"ok","uptime":<seconds>}` and is never gated — kubelet probes carry no authz-proxy headers and no shared secret, so a probe against a protected path such as `/` would fail readiness as soon as auth is enabled. It reports process liveness only, exposing no configuration, identity, or storage detail. The sample probes in `deployment.yaml` point at it.

---

## 🔒 Security Considerations

> [!WARNING]
> * **Token Leakage:** Passing security tokens via query parameters (`?token=...`) makes distribution simple for agents, but means tokens can appear in browser histories or server access logs. TalonPress mitigates this by promoting a valid token to an `HttpOnly` session cookie on first use, but ensure your environment strips query strings from access logs for private package endpoints.
> * **Session Secret:** All session and package cookies are HMAC-signed with `TALONPRESS_SHARED_SECRET`. Rotate this secret to immediately invalidate all active sessions. Set `PUBLIC_BASE_URL` to an `https://` URL in production so the `Secure` cookie flag is applied.
> * **Header Trust:** `AUTHZ_ROLE_SOURCE=header` makes TalonPress believe `X-Auth-Request-Email` and `X-Auth-Request-Role-List` without verification. Anyone able to reach TalonPress directly could then forge an admin identity. Use it only when the proxy is the sole ingress (e.g. a Kubernetes `ClusterIP` Service unreachable from outside) and strips those headers from client requests; otherwise leave `AUTHZ_ROLE_SOURCE=jwt`.
> * **Sandboxing:** Because this application serves arbitrary HTML/JS provided by autonomous agents, ensure that the serving domain is isolated or sandboxed (e.g., utilizing unique subdomains or rigid Content Security Policies) to prevent Cross-Site Scripting (XSS) risks to the parent OpenTalon management console.

```