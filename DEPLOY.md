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
                 contenedor landing-protector-solar1 (nginx en :80)
                         │
                         └── http://72.61.5.135:3001  (prueba directa)
```

Traefik y el contenedor se hablan por la red compartida `traefik-proxy`, que
crea el stack de Traefik en la máquina. El `docker-compose.yml` de este
repositorio se conecta a ella con `external: true`: no la crea ni la borra.

Las etiquetas `traefik.*` de `docker-compose.yml` son las que arman este
camino. Traefik las lee solo: no hay que escribirle nada a mano.

Ojo con la diferencia entre la **carpeta** y el **contenedor**, que es la
confusión más común al trabajar con esto:

| Qué | Cómo se llama | Dónde se cambia |
|---|---|---|
| Carpeta en el servidor | `/docker/landing-protector-solar1` | Cuando se clona el repo |
| Contenedor | `landing-protector-solar1` | `container_name` del compose |
| Imagen | `landing-codigo-web` | la genera `docker compose build` |

Los tres nombres son independientes. El script `/actualizarlanding` no depende
de ninguno: detecta el contenedor por el puerto que publica y arma el nombre
de la imagen solo.

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
docker ps -a --filter name=landing-protector-solar1 \
  --format '{{.Names}}  {{.Status}}  {{.Image}}'
docker inspect landing-protector-solar1 --format '{{.Image}}' > /tmp/imagen-anterior-landing.txt
```

Si el nombre del resolver no es `letsencrypt`, hay que corregir
`traefik.http.routers.protectorsolar.tls.certresolver` en
`docker-compose.yml` **antes** de continuar.

Ojo con el punto 3: las etiquetas de Traefik son parte del contenedor, así que
cambiar el compose no altera el contenedor que ya está corriendo. Recién en el
paso de abajo, cuando se recrea, es cuando entran en vigencia.

## Publicar sin dejar el sitio caído

## Cómo se hace a mano

Esto es lo mismo que hace `/actualizarlanding`, paso por paso. Útil para
entender qué hace el script, o si alguna vez hay que hacerlo sin él.

```bash
# 1. Código limpio en una carpeta nueva
cd /docker
git clone --branch home --depth 1 \
  https://github.com/MagicSales2/Landing---Protector-solar.git landing-codigo
cd landing-codigo
git log --oneline -1

# 2. El nombre del contenedor tiene que ser este
sed -i 's/container_name:.*/container_name: landing-protector-solar1/' docker-compose.yml

# 3. Construir la imagen nueva, sin caché
docker compose build --no-cache

# 4. Apagar lo que esté en el 3001, llámese como se llame
docker ps -q --filter publish=3001 | xargs -r docker rm -f

# 5. Levantar el contenedor nuevo
docker compose up -d
docker compose ps
```

### Verificar

```bash
curl -s -o /dev/null -w 'puerto 3001: %{http_code}\n' http://127.0.0.1:3001/
curl -s -o /dev/null -w 'dominio: %{http_code}\n' https://protectorsolar.skinoferta.cloud/
```

Las dos tienen que decir **200**.

El dominio puede dar 404 los primeros segundos, porque Traefik tarda un
momento en enterarse del contenedor nuevo. Si pasa, esperá unos segundos y
volvé a correr el `curl` del dominio. No es un error.

---

# `/actualizarlanding`

Script que hace toda la actualización en un solo paso. No hay que pasarle
ninguna ruta ni ningún nombre: ya viene todo escrito adentro.

## Cómo se usa

Son dos líneas. La primera baja el script, la segunda lo corre:

```bash
cd /tmp
```

```bash
curl -fsSL "https://api.github.com/repos/MagicSales2/Landing---Protector-solar/contents/actualizarlanding.sh?ref=home" | sed -n 's/^ *"content": *"\(.*\)",$/\1/p' | sed 's/\\n//g' | base64 -d > actualizarlanding.sh
```

```bash
bash actualizarlanding.sh
```

Se puede repetir cada vez que haya cambios. Al final avisa `Ctrl+Shift+R`.

## Qué hace

| Paso | Qué hace | Si falla |
|---|---|---|
| 1 | Baja la rama `home` de GitHub a `/docker/landing-codigo` | No toca nada |
| 2 | Construye la imagen sin caché | No toca nada |
| 3 | Apaga el contenedor del puerto 3001 y levanta el nuevo | — |
| 4 | Verifica puerto y dominio, reintentando hasta 12 veces | Vuelve atrás solo |
| 5 | Confirma que el JavaScript del sitio trae el formulario | Solo avisa |

Guarda el ID de la imagen anterior en `/tmp/imagen-anterior-landing.txt`. Si la
verificación falla, restaura esa imagen y avisa por pantalla.

## Por qué la descarga es tan rara

La línea de descarga no usa `raw.githubusercontent.com` a propósito. Va por la
API de GitHub y viene en base64. Parece enredada, pero es la única forma que
funciona:

`raw.githubusercontent.com` guarda copia de los archivos en servidores de
caché. Sirven la versión anterior del script aunque el push nuevo ya esté
hecho, y a veces durante varios minutos. Cuando eso pasó, el script que se
baixaba era el viejo, que fallaba siempre en el mismo paso y daba a entender
que el build estaba roto cuando el build estaba perfecto. La API no tiene ese
problema.

## Las tres cosas que antes fallaban

Anotadas acá porque son las que costaron más tiempo, para no repetirlas.

**1. Buscar el contenedor por nombre.** El script preguntaba a Docker cuál
era el contenedor del puerto 3001 y le creía. Docker le devolvió
`anthelios_landing_web`, un contenedor viejo que había quedado dando vueltas,
cuando el bueno es `landing-protector-solar1`. El nombre está escrito en el
script, no se adivina.

**2. Confiar en Traefik al instante.** Recién levantado el contenedor, el
dominio da 404 unos segundos porque Traefik todavía no lo vio. El script antes
leía ese 404 como "todo roto" y paraba. Ahora reintenta: primero espera que el
puerto 3001 responda, y recién ahí mira el dominio, hasta 12 veces.

**3. Tirar la actualización por un aviso.** El script buscaba el texto
`formulario-pedido` dentro del JavaScript y, si no lo encontraba, abortaba.
Ese chequeo quedó como aviso. El `index.html` es una cáscara vacía con un
`<div id="root">` y nada más: la página se dibuja después con JavaScript.
Quedarse con el sitio viejo por un aviso es peor que avisar y seguir.

## Si algo sale mal

Para ver qué pasó:

```bash
cd /docker/landing-codigo && docker compose logs --tail 30
```

Para volver atrás a mano:

```bash
docker rm -f landing-protector-solar1
```

```bash
docker run -d --name landing-protector-solar1 -p 3001:80 --restart always $(cat /tmp/imagen-anterior-landing.txt)
```

Eso deja el sitio andando en `http://72.61.5.135:3001`, pero el dominio puede
quedar sin HTTPS hasta que se repita `cd /docker/landing-codigo && docker compose up -d`,
porque el contenedor que se crea así no lleva las etiquetas de Traefik.

## Cambiar el dominio o el contenedor

Arriba del todo del script están las variables. Si algún día hay otro
proyecto, se cambian y nada más:

```bash
REPO / RAMA / DOMINIO / PUERTO / CONTENEDOR / CARPETA
```

Importante: si se cambia `CONTENEDOR`, hay que cambiar también el
`container_name:` del `docker-compose.yml`, o los dos contenedores chocan por
el mismo puerto.
