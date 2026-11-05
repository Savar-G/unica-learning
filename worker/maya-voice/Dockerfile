# syntax=docker/dockerfile:1
# Maya's voice worker (#326, #533): the image LiveKit Cloud runs (docs/maya-voice-deploy.md).
#
# The build context is the repository root, or the folder scripts/voice-deploy-context.mjs stages from it (the same
# layout: src/lib and worker/maya-voice). Locally: docker build -f worker/maya-voice/Dockerfile -t maya-voice .
#
# Stage 1 bundles worker/maya-voice/src/main.ts with the site's modules it uses (src/lib) into dist/main.mjs. Stage 2
# holds only that file and the npm packages it leaves outside (worker/maya-voice/package.json), on a glibc image:
# LiveKit's native module has no musl build, and LiveKit Cloud does not support Alpine.
ARG NODE_VERSION=22.23.1

FROM node:${NODE_VERSION}-bookworm-slim AS build
WORKDIR /app/worker/maya-voice
COPY worker/maya-voice/package.json worker/maya-voice/package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
WORKDIR /app
COPY src/lib ./src/lib
COPY worker/maya-voice/build.mjs ./worker/maya-voice/build.mjs
COPY worker/maya-voice/src ./worker/maya-voice/src
RUN node worker/maya-voice/build.mjs

FROM node:${NODE_VERSION}-bookworm-slim
RUN apt-get update -qq && apt-get install --no-install-recommends -y ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY worker/maya-voice/package.json worker/maya-voice/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/worker/maya-voice/dist ./dist
# `server-only` must be the empty module under the react-server condition, in the worker and in every job process it
# starts (they inherit NODE_OPTIONS).
ENV NODE_ENV=production NODE_OPTIONS=--conditions=react-server
RUN useradd --uid 10001 --no-create-home --shell /usr/sbin/nologin appuser
USER appuser
# LiveKit Cloud injects LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET; every other value is a LiveKit secret.
CMD ["node", "dist/main.mjs", "start"]
