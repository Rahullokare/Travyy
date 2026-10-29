# Node 22.18+ runs TypeScript directly (type stripping): no build step, no tsx in production.
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
USER node
EXPOSE 8787
CMD ["node", "src/index.ts"]
