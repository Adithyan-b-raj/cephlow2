FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api-server/package.json ./apps/api-server/
COPY packages ./packages
COPY scripts ./scripts
RUN pnpm install --frozen-lockfile --prod=false

FROM base AS runtime
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api-server/node_modules ./apps/api-server/node_modules
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api-server ./apps/api-server
COPY packages ./packages
COPY scripts ./scripts

ENV NODE_ENV=production
EXPOSE 3000

CMD ["pnpm", "--filter", "@workspace/api-server", "exec", "tsx", "./src/index.ts"]
