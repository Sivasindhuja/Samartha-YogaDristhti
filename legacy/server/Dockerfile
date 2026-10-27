# Stage 1: Build the React application
FROM node:20 AS build

WORKDIR /app/web

COPY package*.json .
RUN npm install

COPY . .

# Build the project (creates the /dist directory)
RUN npm run build

# Stage 2: Serve the built static files with a minimal Nginx server
FROM nginx:alpine

# Copy the built files from the build stage into the Nginx public folder
COPY --from=build /app/web/dist /usr/share/nginx/html

# Expose the default Nginx port
EXPOSE 80

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]