FROM node:22-alpine
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api-server/package.json ./apps/api-server/
COPY packages/api-client-react/package.json ./packages/api-client-react/
COPY packages/api-spec/package.json ./packages/api-spec/
COPY packages/api-zod/package.json ./packages/api-zod/
COPY packages/firebase/package.json ./packages/firebase/
COPY packages/supabase/package.json ./packages/supabase/
COPY scripts/package.json ./scripts/

RUN pnpm install --frozen-lockfile

COPY apps/api-server ./apps/api-server
COPY packages ./packages
COPY scripts ./scripts

ENV NODE_ENV=production
EXPOSE 3000

CMD ["pnpm", "--filter", "@workspace/api-server", "exec", "tsx", "./src/index.ts"]
