# The multiplayer server (server/, docs/deploy.md). Built in the first stage;
# it runs from one file with everything in it, so the image has no node_modules.
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build:server

FROM node:24-slim
WORKDIR /app
COPY --from=build /app/dist-server/server/main.js .
# The traffic reader (server/traffic.ts) is its own container from this image: node traffic.js (docs/deploy.md).
COPY --from=build /app/dist-server/server/traffic.js .
# The admin's sessions are made of these levels (LEVELS_DIR); the admin command asks the admin API (server/admin.mjs).
COPY --from=build /app/public/levels ./levels
COPY --from=build /app/server/admin.mjs .
ENV LEVELS_DIR=levels
USER node
EXPOSE 3000 3001
CMD ["node", "--expose-gc", "main.js"]
