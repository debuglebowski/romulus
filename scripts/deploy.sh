#!/bin/bash
# Deployment script for Convex backend (Cloudflare Pages handles frontend)

set -e

echo "🔄 Installing dependencies..."
bun install

echo "🔄 Codegen..."
bunx convex codegen

echo "🏗️  Building frontend..."
bun run build

echo "🔄 Testing types..."
bun run test:types

echo "🚀 Deploying Convex backend..."
npx convex deploy --cmd "bun run build" --cmd-url-env-var-name VITE_CONVEX_URL

echo "✅ Convex deployment complete!"
