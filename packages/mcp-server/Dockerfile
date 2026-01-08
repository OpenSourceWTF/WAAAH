FROM node:20-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS build
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY . /usr/src/app
WORKDIR /usr/src/app
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm --filter @opensourcewtf/waaah-mcp-server build
RUN pnpm --filter @opensourcewtf/waaah-mcp-server deploy --prod --legacy /prod/mcp-server

FROM base AS mcp-server
COPY --from=build /prod/mcp-server /app
# Copy the built admin dashboard to expected path (server.ts expects /app/packages/mcp-server/public)
COPY --from=build /usr/src/app/packages/mcp-server/public /app/packages/mcp-server/public
WORKDIR /app
EXPOSE 3000
CMD [ "node", "dist/server.js" ]
