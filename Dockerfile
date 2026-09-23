# Container build for the TrueTick MCP server.
# Used by Glama.ai automated safety/quality checks and anyone preferring a
# containerized run. Normal installs use `npx -y @truetick/mcp` (see README).
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
COPY src ./src
RUN npm ci && npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
# Runtime config via env: TRUETICK_API_KEY (required), TRUETICK_API_URL (optional).
# Transport is stdio.
ENTRYPOINT ["node", "dist/index.js"]
