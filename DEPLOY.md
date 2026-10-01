# Anthelios — landing de ventas

Protector solar Anthelios. Pedidos por Wompi o contra entrega, sincronizados
con Kommo, Telegram y Google Sheets.

## Publicar

### GitHub Pages (lo que está vivo hoy)

El push a la rama `home` dispara el workflow de `.github/workflows/deploy.yml`,
que compila y publica en `gh-pages`.

```bash
git checkout home
git add -A
git commit -m "mensaje"
git push origin home
```

Tarda ~1 minuto. Sale en:
`https://magicsales2.github.io/Landing---Protector-solar/`

### Hostinger (o cualquier hosting con Apache)

```bash
npm ci
npm run lint
npm run build
```

Sin variables de entorno: `dist/` ya sale compilado con el dominio de
`.env.production` (`VITE_SITE_URL`). En Hostinger sube el **contenido** de
`dist/` a `public_html/` (el `.htaccess` que trae se encarga de la caché y la
compresión).

Si algún día cambiás de dominio, ver "Cambiar el dominio" más abajo.

### Dominio actual

- Sitio: `https://protectorsolar.skinoferta.cloud/`
- GitHub Pages queda como espejo: `https://magicsales2.github.io/Landing---Protector-solar/`

## Cambiar el dominio

Al compilar para Hostinger, define la URL del sitio:

```bash
VITE_SITE_URL=https://tudominio.com/ npm run build
```

Eso solo cambia el `canonical`, las tarjetas de compartir (WhatsApp, Facebook)
y los enlaces. **El backend no cambia**: para que la página de gracias y los
links de Wompi apunten al dominio nuevo, hay que actualizar el secreto
`SITIO_URL` de las funciones de Supabase.

## Variables de entorno

Están en `.env.production` (versionado a propósito: la llave anónima de
Supabase y el id del píxel son públicos por diseño, viajan en el bundle).

| Variable | Para qué |
|---|---|
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | Conexión a la base |
| `VITE_TIKTOK_PIXEL_ID` | Píxel de TikTok (Events Manager) |
| `VITE_SITE_URL` | Dominio para canonical y tarjetas |

> **Ojo:** una variable de entorno vacía pisa el valor de `.env.production`.
> Por eso el workflow solo pasa los secretos que existen de verdad en GitHub.

Los secretos de verdad (Kommo, Wompi, Envia, Telegram) viven como secretos de
las funciones de Supabase, nunca en el repositorio.

## Estructura

| Ruta | Qué hay |
|---|---|
| `src/App.tsx` | Landing: ofertas, checkout, panel y página de gracias |
| `src/lib/tracking.ts` | Píxeles de Meta y TikTok |
| `src/lib/supabaseClient.ts` | Cliente de Supabase y llamadas a las funciones |
| `supabase/functions/` | Backend (Wompi, Kommo, Sheets, Telegram, Envia) |
| `supabase/migrations/` | Esquema de la base, en orden |
| `apps-script/Code.gs` | El script que escribe en Google Sheets |
| `public/` | Imágenes y videos (van con `og-image.jpg`) |

---

# Despliegue en Docker + Traefik (VPS)

Este es el camino para el dominio real
`https://protectorsolar.skinoferta.cloud`. Reemplaza por completo la
subida de archivos por FTP.

## Cómo queda

```
Internet ──https──> Traefik (:443, TLS de Let's Encrypt)
                         │
                         │ red compartida "traefik-proxy"
                         ▼
                 contenedor anthelios_landing_web (nginx en :80)
                         │
                         └── http://72.61.5.135:3001  (prueba directa)
```

Traefik y el contenedor se hablan por la red compartida `traefik-proxy`, que
crea el stack de Traefik en la máquina. El `docker-compose.yml` de este
repositorio se conecta a ella con `external: true`: no la crea ni la borra.

Las etiquetas `traefik.*` de `docker-compose.yml` son las que arman este
camino. Traefik las lee solo: no hay que escribirle nada a mano.

## Poner esta landing en otro subdominio

Copiar el bloque de `labels` y cambiar **solo** tres cosas:

| Qué | Ahora | Cambiar a |
|---|---|---|
| Nombre del router | `protectorsolar` | `elnuevosubdominio` |
| Nombre del servicio | `protectorsolar` | `elnuevosubdominio` |
| Regla `Host(...)` | `protectorsolar.skinoferta.cloud` | `elnuevosubdominio.skinoferta.cloud` |

El nombre del router tiene que ser único en toda la máquina: si dos landings
usan el mismo, Traefik se confunde y deja de publicar uno de los dos.

Y en el panel de DNS, el registro A del subdominio nuevo tiene que apuntar a
la IP del servidor.

## Antes de tocar nada: mirar cómo está

Tres datos hay que confirmar **en el servidor**, porque no se pueden adivinar:

```bash
# 1. Que la red compartida con Traefik existe y cómo se llama
docker network ls | grep -i traefik
#    -> tiene que existir una llamada "traefik-proxy". Ese nombre es el que va
#       en "traefik.docker.network" y en el bloque "networks:" del compose.
#       Si no existe, el build falla con "network traefik-proxy not found":
#       es que el stack de Traefik no está levantado.

# 2. Cómo se llama el "certificates resolver" (tiene que ser "letsencrypt")
docker ps --format '{{.Names}}' | grep -i traefik
docker exec <contenidor-traefik> cat /etc/traefik/traefik.yml 2>/dev/null \
  || docker exec <contenedor-traefik> cat /etc/traefik/traefik.toml 2>/dev/null
#    -> buscar:  certificatesResolvers:
#                    letsencrypt:            <-- este nombre es el que va en la etiqueta

# 3. Cómo está el contenedor de la landing ahora mismo (para poder volver atrás)
docker ps -a --filter name=anthelios_landing_web \
  --format '{{.Names}}  {{.Status}}  {{.Image}}'
docker inspect anthelios_landing_web --format '{{.Image}}' > /tmp/imagen-anterior.txt
```

Si el nombre del resolver no es `letsencrypt`, hay que corregir
`traefik.http.routers.protectorsolar.tls.certresolver` en
`docker-compose.yml` **antes** de continuar.

Ojo con el punto 3: las etiquetas de Traefik son parte del contenedor, así que
cambiar el compose no altera el contenedor que ya está corriendo. Recién en el
paso de abajo, cuando se recrea, es cuando entran en vigencia.

## Publicar sin dejar el sitio caído

El orden importa: primero se construye y se prueba la imagen nueva en un
puerto aparte, y solo cuando está buena se cambia el contenedor que está
sirviendo.

```bash
# 1. Código limpio, en una carpeta nueva (la vieja no es un repo Git)
cd /docker
git clone --branch home --depth 1 \
  https://github.com/MagicSales2/Landing---Protector-solar.git landing-nuevo
cd landing-nuevo
git log --oneline -1          # tiene que ser c43dea2

# 2. Construir la imagen nueva, sin caché
docker compose build --no-cache

# 3. Probarla en un puerto momentáneo, SIN tocar el que está sirviendo
docker images --format '{{.Repository}}:{{.Tag}}' | grep -E 'web$'   # nombre de la imagen
docker run -d --rm --name prueba-landing -p 3002:80 <NOMBRE-DE-LA-IMAGEN-ARRIBA>
sleep 3
curl -s http://127.0.0.1:3002/ | grep -o 'index-[A-Za-z0-9_-]*\.js'
curl -s -o /dev/null -w 'puerto de prueba: %{http_code}\n' http://127.0.0.1:3002/
docker rm -f prueba-landing

# Si el paso 3 no devuelve el HTML con el script, PARAR acá. No seguir.

# 4. Cambiar el contenedor que está sirviendo
docker stop anthelios_landing_web
docker compose up -d
docker compose ps
docker compose logs --tail=30

# 5. Verificar por los dos lados
curl -s -o /dev/null -w 'puerto 3001: %{http_code}\n' http://127.0.0.1:3001/
curl -s -o /dev/null -w 'dominio:     %{http_code}\n' https://protectorsolar.skinoferta.cloud/
```

> Las etiquetas son parte del contenedor, así que el paso 4 tiene que
> recrearlo. `docker compose up -d` lo hace solo porque el compose cambió.
> **Nunca** `docker compose down` después de verificar: eso apaga el sitio.

## Si algo sale mal

```bash
# Volver a la imagen anterior (el ID quedó guardado en el paso 3 de la inspection)
cat /tmp/imagen-anterior.txt
```

Con ese ID:

```bash
docker rm -f anthelios_landing_web
docker run -d --name anthelios_landing_web -p 3001:80 --restart always \
  sha256:<ID-ANTERIOR>
```

Eso deja el sitio como estaba, pero **sin** las etiquetas de Traefik: el
dominio no responderá hasta que se vuelva a aplicar el compose.

## Registro DNS

En el panel de `skinoferta.cloud`:

| Tipo | Nombre | Valor |
|---|---|---|
| A | `protectorsolar` | `72.61.5.135` |

Y el puerto **80 tiene que quedar abierto**, porque es el que usa
Let's Encrypt para validar el certificado. El 443 también.
