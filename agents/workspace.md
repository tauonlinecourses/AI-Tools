# Tools Workspace — Build Instructions (moved)

This file was split into smaller, task-scoped docs so agents can load only what they need.

**Start here:** [`workspace/README.md`](./workspace/README.md)

## Tool architecture rule

Choose the deployment boundary based on the size and independence of the tool:

- **Small utility or single-page tool:** build it inside `apps/hub` and expose it as a Hub route such as `/calculator`. It ships with the existing Hub Vercel project.
- **Standalone product:** create a separate app under `apps/` and deploy it as its own Vercel project. Use this when it needs substantial dependencies, API functions, environment variables, independent releases, or isolated scaling.
- A Vercel project is not nested beneath another Vercel project. All projects may use this same Git repository; the Root Directory selects the app each project deploys.
- A small Hub route can be extracted into a standalone app later if it grows.

See [workspace/10-run-deploy-conventions.md](./workspace/10-run-deploy-conventions.md) for the complete decision guide and deployment instructions.

| Section | File |
|---|---|
| Overview | [workspace/01-overview.md](./workspace/01-overview.md) |
| Monorepo root | [workspace/02-monorepo-root.md](./workspace/02-monorepo-root.md) |
| `packages/config` | [workspace/03-packages-config.md](./workspace/03-packages-config.md) |
| `packages/ui` basics | [workspace/04-packages-ui-basics.md](./workspace/04-packages-ui-basics.md) |
| `packages/ui` layout | [workspace/05-packages-ui-layout.md](./workspace/05-packages-ui-layout.md) |
| `packages/ai-client` | [workspace/06-packages-ai-client.md](./workspace/06-packages-ai-client.md) |
| Hub config | [workspace/07-apps-hub-config.md](./workspace/07-apps-hub-config.md) |
| Hub UI | [workspace/08-apps-hub-ui.md](./workspace/08-apps-hub-ui.md) |
| Tool starter | [workspace/09-apps-tool-starter.md](./workspace/09-apps-tool-starter.md) |
| Run / deploy / design | [workspace/10-run-deploy-conventions.md](./workspace/10-run-deploy-conventions.md) |
