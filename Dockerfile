FROM node:20-alpine AS builder
WORKDIR /app

# Install deps
COPY package.json package-lock.json* ./
RUN npm install

# Build
COPY . .
RUN npm run build
# Nitro (used by the TanStack Start plugin) may emit static files to .output/public
# Ensure we have a `dist` folder for the runner stage by copying `.output/public` -> `dist`
RUN sh -c 'if [ -d .output/public ]; then cp -a .output/public dist; fi'

FROM node:20-alpine AS development
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
EXPOSE 5173
CMD ["npm","run","dev","--","--host","0.0.0.0","--port","5173"]

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["npx","vite","preview","--host","0.0.0.0","--port","3000"]
