# build stage
FROM node:20-alpine AS build
WORKDIR /app
# npm ci en vez de npm install: instala exactamente lo que dice el
# package-lock.json. "npm install" puede resolver versiones nuevas y romper el
# build sin que se haya tocado nada.
COPY package*.json ./
RUN npm ci
COPY . .
# El .dockerignore saca node_modules de la máquina: acá entra el que instaló
# npm ci, compilado para esta imagen. Si se cuela el de afuera, el build falla.
RUN npm run build

# run stage (static using custom high-performance Nginx)
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
