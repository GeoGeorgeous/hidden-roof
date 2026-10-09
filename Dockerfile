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
USER node
EXPOSE 3000
CMD ["node", "main.js"]
