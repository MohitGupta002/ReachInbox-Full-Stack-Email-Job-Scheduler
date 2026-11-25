FROM node:20-slim

WORKDIR /app

# Install production dependencies only for smaller container image
COPY package*.json ./
RUN npm ci --omit=dev

# Copy backend source files
COPY src ./src

ENV NODE_ENV=production
ENV PORT=5000

EXPOSE 5000

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 5000) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "src/server.js"]
