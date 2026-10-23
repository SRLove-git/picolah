# syntax=docker/dockerfile:1

# ---- build: compile the Vite frontend and keep server deps ----
FROM node:24-alpine AS build
WORKDIR /app
RUN npm install -g pnpm@11.28.5
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
COPY server ./server
COPY shared ./shared
COPY mock ./mock
COPY public ./public
RUN pnpm build

# ---- runtime: Node + tsx serving API and the built frontend ----
FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8787
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY --from=build /app/server ./server
COPY --from=build /app/shared ./shared
COPY --from=build /app/mock ./mock
COPY --from=build /app/dist ./dist

EXPOSE 8787
CMD ["./node_modules/.bin/tsx", "server/index.ts"]
