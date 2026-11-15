# Sera.cx Payroll API. Build from the repository root:
#   docker build -f apps/api/Dockerfile -t sera-payroll-api .
# Runs migrations on start. Set DATABASE_URL for Postgres; without it the
# server uses an embedded PGlite database at PGLITE_DIR (mount a volume).
FROM node:22-slim AS build
RUN corepack enable && corepack prepare pnpm@10.4.1 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/chain/package.json packages/chain/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @sera-payroll/api...
COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm --filter @sera-payroll/core --filter @sera-payroll/db --filter @sera-payroll/chain --filter @sera-payroll/api build \
 && pnpm prune --prod

FROM node:22-slim
ENV NODE_ENV=production PORT=4000 PGLITE_DIR=/data/pglite
WORKDIR /app
COPY --from=build /app /app
RUN mkdir -p /data && chown -R node:node /data /app
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/api/dist/server.js"]
