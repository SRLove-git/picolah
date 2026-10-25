# syntax=docker/dockerfile:1
FROM node:24-alpine
WORKDIR /app
RUN npm install -g pnpm@11.28.5

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY web/package.json ./web/package.json
COPY crawler/package.json ./crawler/package.json
RUN pnpm install --filter @picolah/crawler... --frozen-lockfile

COPY crawler ./crawler

ENV CRAWLER_TOOL_HOST=0.0.0.0 \
    CRAWLER_TOOL_PORT=8790
EXPOSE 8790
CMD ["./crawler/node_modules/.bin/tsx", "crawler/src/tool-server.ts"]
