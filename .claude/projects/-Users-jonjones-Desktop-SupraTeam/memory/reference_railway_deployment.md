---
name: Railway deployment setup and optimization
description: Railway project IDs, service IDs, auto-deploy triggers, and optimization settings for all projects
type: reference
---

## Railway Projects

| Project | ID | Service | Service ID |
|---------|------|---------|------------|
| SupraTeam (was supracrm) | 5890df15-5cf8-4a99-865a-1b95511f51ea | SupraTeam | 9eea9dcb-701c-43e7-9c20-7962055a6ab2 |
| SupraTeam | same | cron-daily-digest | 8dd9a1ac-086c-48df-8bfd-cc612a582063 |
| SupraTeam | same | cron-5min | a92bb577-9f02-4fc9-a944-267233378c9c |
| SupraLoop | 83a43ac4-d790-4a15-8a7b-7754cb74b35d | SupraLoop | cc38c3d1-eecf-4b11-9674-508fae9b1dba |
| loving-clarity | 92ea0a1b-81d9-4e18-bd7f-9d3a3e835b0f | LeeJones | 2ac2c3d9-72df-4a46-82a3-c221e4f71f5c |

## Auto-Deploy Triggers (set up 2026-03-25)
- SupraTeam → `SupraAgent/SupraTeam@main`
- SupraLoop → `SupraAgent/SupraLoop@main`
- LeeJones → `SupraAgent/LeeJones@main` (was already set)

## Railway GraphQL API
- Endpoint: `https://backboard.railway.com/graphql/v2`
- Auth: `Bearer` token from `~/.railway/config.json` → `user.token`
- Key mutations: `deploymentTriggerCreate`, `serviceUpdate`, `projectUpdate`, `serviceInstanceRedeploy`

## Optimization Settings (SupraTeam)
- Builder: Railpack (replaces Nixpacks — better caching)
- `output: 'standalone'` in next.config.ts (smaller image, ~77MB vs ~1.3GB)
- `start.sh` handles static asset copy + standalone server startup
- Health check: `/api/health`, 60s timeout
- Build command auto-builds `packages/automation-builder` before `next build`

## Railway MCP Server
Install: `claude mcp add railway-mcp-server -- npx -y @railway/mcp-server`
Provides 146+ tools for managing Railway via Claude Code.
