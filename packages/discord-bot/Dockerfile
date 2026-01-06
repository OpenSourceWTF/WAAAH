FROM node:20-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS build
COPY . /usr/src/app
WORKDIR /usr/src/app
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm --filter @waaah/discord-bot build
RUN pnpm --filter @waaah/discord-bot deploy --prod --legacy /prod/discord-bot

FROM base AS discord-bot
COPY --from=build /prod/discord-bot /app
WORKDIR /app
CMD [ "node", "dist/index.js" ]
