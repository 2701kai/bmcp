FROM oven/bun:1.4 AS base
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production
COPY src ./src
COPY knowledge ./knowledge
COPY repos.yaml ./
ENV PORT=8787
EXPOSE 8787
USER bun
CMD ["bun", "src/server.ts"]
