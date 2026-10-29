FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY web/package.json ./web/package.json
RUN npm ci --no-audit --no-fund
COPY web ./web
RUN npm run build
FROM nginx:alpine
COPY web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/web/dist /usr/share/nginx/html/hand-and-foot
EXPOSE 80
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 CMD wget -q --spider http://127.0.0.1/hand-and-foot/
