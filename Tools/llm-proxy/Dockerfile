# SCP LIFE AI server (the APK and the browser build talk to it; the Anthropic API key lives only here)
FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.mjs ./
ENV PORT=8787
EXPOSE 8787
CMD ["node", "server.mjs"]
