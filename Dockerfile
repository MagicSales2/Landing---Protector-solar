# build stage
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
# Using npm install is safer in diverse environments if package-lock needs minor resolution
RUN npm install
COPY . .
RUN npm run build

# run stage (static using custom high-performance Nginx)
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
