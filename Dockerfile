FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

# Build stage (run migrations at startup, not build time)
FROM base AS runner
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Run migrations then start server
CMD ["bun", "run", "start"]
