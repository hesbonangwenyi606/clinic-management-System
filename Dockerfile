FROM node:22-bookworm AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages ./packages
RUN npm ci
COPY apps ./apps
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN npm run db:generate --workspace @cms/api
ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN npm run build

FROM build AS api
ENV NODE_ENV=production
EXPOSE 3001
CMD ["npm", "run", "start", "--workspace", "@cms/api"]

FROM build AS web
ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "run", "start", "--workspace", "@cms/web"]
