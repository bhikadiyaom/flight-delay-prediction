# Static client served by nginx. Build context: ./client
#   docker build --build-arg VITE_API_URL=https://api.example.com -t fdp-client ./client
# VITE_API_URL is baked into the JS at BUILD time. API_ORIGIN (runtime) feeds the Content-Security-Policy connect-src.
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_API_URL=http://localhost:5000
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM nginx:1.27-alpine
# the official image runs envsubst over /etc/nginx/templates/*.template at start (only for variables that are set)
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
ENV API_ORIGIN=http://localhost:5000
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD wget -qO- http://127.0.0.1/healthz >/dev/null || exit 1
