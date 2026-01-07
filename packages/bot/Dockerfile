FROM node:20-alpine

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy workspace files
COPY pnpm-workspace.yaml ./
COPY package.json pnpm-lock.yaml ./

# Copy packages
COPY packages/bot ./packages/bot
COPY packages/types ./packages/types

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build
RUN pnpm -C packages/types build
RUN pnpm -C packages/bot build

WORKDIR /app/packages/bot

CMD ["node", "dist/index.js"]
