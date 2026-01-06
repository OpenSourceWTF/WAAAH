FROM node:20-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS build
COPY . /usr/src/app
WORKDIR /usr/src/app
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm --filter @waaah/mcp-server build
RUN pnpm --filter @waaah/mcp-server deploy --prod --legacy /prod/mcp-server

FROM base AS mcp-server
COPY --from=build /prod/mcp-server /app
WORKDIR /app
EXPOSE 3000
CMD [ "node", "dist/server.js" ]
