# syntax=docker/dockerfile:1

# ---- build: compile the Vite frontend and keep server deps ----
FROM node:24-alpine AS build
WORKDIR /app
RUN npm install -g pnpm@11.28.5
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY web/package.json ./web/package.json
RUN pnpm install --frozen-lockfile
COPY web/tsconfig.json web/vite.config.ts web/index.html ./web/
COPY web/src ./web/src
COPY web/server ./web/server
COPY web/shared ./web/shared
COPY web/mock ./web/mock
COPY web/public ./web/public
RUN pnpm build

# ---- runtime: Node + tsx serving the API and the built frontend ----
FROM node:24-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache sqlite
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8787
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/web/node_modules ./web/node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/web/package.json ./web/package.json
COPY --from=build /app/web/tsconfig.json ./web/tsconfig.json
COPY --from=build /app/web/server ./web/server
COPY --from=build /app/web/shared ./web/shared
COPY --from=build /app/web/mock ./web/mock
COPY --from=build /app/web/dist ./web/dist
COPY scripts ./scripts

EXPOSE 8787
CMD ["./web/node_modules/.bin/tsx", "web/server/index.ts"]
