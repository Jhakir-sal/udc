FROM node:22-bookworm-slim AS base

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

FROM base AS build

COPY package.json package-lock.json ./
RUN npm ci --include=dev

COPY tsconfig.json vite.config.ts postcss.config.js tailwind.config.ts ./
COPY client ./client
COPY server ./server
COPY shared ./shared
COPY script ./script
COPY attached_assets ./attached_assets
COPY previews ./previews

RUN npm run test:media
ARG PRODUCTION_SITE_URL
RUN npm run build
RUN npm prune --omit=dev

FROM base AS runtime

ENV NODE_ENV=production \
    PORT=5000

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

USER node
EXPOSE 5000
CMD ["node", "dist/index.cjs"]
