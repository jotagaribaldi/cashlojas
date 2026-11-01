FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV DATABASE_URL=postgresql://cashlojas:build-only@127.0.0.1:5432/cashlojas
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ openssl && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/* && groupadd --system cashlojas && useradd --system --gid cashlojas cashlojas
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
RUN chown -R cashlojas:cashlojas /app
USER cashlojas
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && npm run seed:root && node dist/main.js"]
