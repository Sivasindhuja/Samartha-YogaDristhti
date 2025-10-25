# Stage 1: Build the React application
FROM node:20 AS build
WORKDIR /app/web
COPY package*.json .
RUN npm install
COPY . .
RUN npm run build

# Stage 2: Serve the built static files with a minimal Nginx server
FROM nginx:alpine

# CRITICAL ADDITION: Copy the custom Nginx configuration
# FIX: Change the source path from 'web/nginx.conf' to 'nginx.conf' 
# assuming nginx.conf is in the same directory as this Dockerfile (i.e., 'web')
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy the built files from the build stage into the Nginx public folder
COPY --from=build /app/web/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
