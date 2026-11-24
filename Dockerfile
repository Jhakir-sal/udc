FROM cgr.dev/chainguard/wolfi-base:latest AS base

RUN apk upgrade --no-cache \
    && apk add --no-cache nodejs-24 ffmpeg-9.1 libstdc++ 'libxml2-16>=2.15.4-r4'

WORKDIR /app

FROM base AS build

RUN apk add --no-cache npm-12

COPY package.json package-lock.json ./
RUN npm ci --include=dev --strict-allow-scripts

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

USER nonroot
EXPOSE 5000
CMD ["node", "dist/index.cjs"]
