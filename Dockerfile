# Build stage
FROM node:20-alpine AS build

WORKDIR /app

# Build arguments for Vite environment variables
ARG VITE_CONVEX_URL
ARG VITE_GOOGLE_CLIENT_ID

# Set as environment variables for the build
ENV VITE_CONVEX_URL=$VITE_CONVEX_URL
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Production stage
FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
