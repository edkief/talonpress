/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  serverExternalPackages: ['@modelcontextprotocol/sdk'],
  // Let route handlers manage trailing-slash redirects for /pub/* themselves
  skipTrailingSlashRedirect: true,
  experimental: {
    proxyClientMaxBodySize: "25mb"
  }
}

module.exports = nextConfig
