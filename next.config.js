/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  serverExternalPackages: ['@modelcontextprotocol/sdk'],
}

module.exports = nextConfig
