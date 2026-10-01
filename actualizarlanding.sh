#!/usr/bin/env bash
# ============================================================================
#  /actualizarlanding
#
#  Actualiza la landing a la última versión de GitHub sin dejar el sitio caído.
#
#  Cómo usarlo:
#      curl -O https://raw.githubusercontent.com/MagicSales2/Landing---Protector-solar/home/actualizarlanding.sh
#      bash actualizarlanding.sh
#
#  El script NO necesita que se le pase nada: detecta solo la carpeta del
#  proyecto, el nombre del contenedor y el nombre de la imagen. Si algún día
#  cambian, el script se sigue adaptando.
#
#  Qué hace, en orden:
#    1. Detecta dónde está el proyecto y qué contenedor está sirviendo.
#    2. Baja el código más reciente de la rama "home" en una carpeta limpia.
#    3. Construye la imagen Docker sin caché.
#    4. La prueba en un puerto aparte (3002), SIN tocar el sitio. Si algo sale
#       mal, se para acá y el sitio sigue como estaba.
#    5. Cambia el contenedor por el nuevo.
#    6. Verifica el puerto 3001 y el dominio con HTTPS.
#    7. Si falla la verificación, vuelve a la imagen anterior automáticamente.
# ============================================================================

set -uo pipefail

# --- Configuración (cambiar acá si algún día hay otro proyecto) ------------
RAMA="home"
REPO="https://github.com/MagicSales2/Landing---Protector-solar.git"
DOMINIO="protectorsolar.skinoferta.cloud"
PUERTO_LOCAL="3001"
PUERTO_PRUEBA="3002"
RED_TRAEFIK="traefik-proxy"
CARPETA_NUEVA="/docker/landing-actualizado"

# --- Colores ---------------------------------------------------------------
VERDE='\033[0;32m'; ROJO='\033[0;31m'; AMARILLO='\033[0;33m'; GRIS='\033[0;90m'; FIN='\033[0m'
paso()  { echo -e "\n${VERDE}==> $1${FIN}"; }
info()  { echo -e "${GRIS}    $1${FIN}"; }
error() { echo -e "${ROJO}!!! $1${FIN}"; }

echo -e "${VERDE}=============================================${FIN}"
echo -e "${VERDE}  Actualizar la landing a la última versión${FIN}"
echo -e "${VERDE}=============================================${FIN}"

# ============================================================================
paso "1/6  Detectar qué hay en el servidor"
# ============================================================================

# Contenedor que publica el puerto 3001.
CONTENEDOR=$(docker ps --filter "publish=${PUERTO_LOCAL}" --format '{{.Names}}' | head -1)
if [ -z "$CONTENEDOR" ]; then
  CONTENEDOR=$(docker ps -a --format '{{.Names}}\t{{.Ports}}' \
    | grep "${PUERTO_LOCAL}" | cut -f1 | head -1)
fi

if [ -z "$CONTENEDOR" ]; then
  error "No se encontró ningún contenedor publicando el puerto ${PUERTO_LOCAL}."
  info "Listo lo que hay:"
  docker ps -a --format '{{.Names}}  {{.Status}}  {{.Ports}}' | head -20
  exit 1
fi
info "Contenedor que sirve: $CONTENEDOR"

IMAGEN_ANTERIOR=$(docker inspect "$CONTENEDOR" --format '{{.Image}}' 2>/dev/null || echo "")
if [ -n "$IMAGEN_ANTERIOR" ]; then
  echo "$IMAGEN_ANTERIOR" > /tmp/imagen-anterior-landing.txt
  info "Imagen actual: ${IMAGEN_ANTERIOR:0:25}...  (guardada para poder volver atrás)"
else
  info "Aviso: no se pudo leer la imagen del contenedor."
fi

# ¿Está el proyecto como repositorio Git?
CARPETA_OLD=""
for d in /docker/*/; do
  d="${d%/}"
  [ -f "$d/docker-compose.yml" ] || continue
  if [ -d "$d/.git" ]; then CARPETA_OLD="$d"; break; fi
  [ -z "$CARPETA_OLD" ] && CARPETA_OLD="$d"
done
if [ -n "$CARPETA_OLD" ]; then
  info "Proyecto encontrado en: $CARPETA_OLD"
  [ -d "$CARPETA_OLD/.git" ] && info "Es un repositorio Git" \
                            || info "NO es un repositorio Git (copia vieja)"
else
  info "No se encontró ningún proyecto en /docker"
fi

# La red de Traefik tiene que existir, si no el contenedor no levanta.
if ! docker network ls --format '{{.Name}}' | grep -qx "$RED_TRAEFIK"; then
  error "La red '${RED_TRAEFIK}' no existe. El stack de Traefik no está levantado."
  info "Listo las redes: $(docker network ls --format '{{.Name}}' | tr '\n' ' ')"
  info "Levantá Traefik y volvé a correr este script. NO se tocó el sitio."
  exit 1
fi
info "Red de Traefik '${RED_TRAEFIK}' presente"

# ============================================================================
paso "2/6  Código más reciente de la rama $RAMA"
# ============================================================================
rm -rf "$CARPETA_NUEVA"
cd /docker 2>/dev/null || { error "No existe /docker"; exit 1; }
git clone --branch "$RAMA" --depth 1 "$REPO" "$CARPETA_NUEVA" \
  || { error "Falló la descarga de GitHub. El sitio NO se tocó."; exit 1; }
cd "$CARPETA_NUEVA" || exit 1
COMMIT=$(git log --oneline -1)
info "Versión a instalar: $COMMIT"

# El nombre del contenedor en el compose tiene que ser el mismo que ya está
# corriendo. Si no, los dosquerrian arrancar y chocan.
NOMBRE_EN_COMPOSE=$(grep -oE 'container_name:[[:space:]]*[^[:space:]]+' docker-compose.yml \
  | head -1 | awk '{print $2}')
if [ "$NOMBRE_EN_COMPOSE" != "$CONTENEDOR" ]; then
  info "Ajustando container_name: '${NOMBRE_EN_COMPOSE}' -> '${CONTENEDOR}'"
  sed -i "s/container_name:[[:space:]]*${NOMBRE_EN_COMPOSE}/container_name: ${CONTENEDOR}/" \
    docker-compose.yml
fi

# El nombre de la imagen que genera este compose.
IMAGEN="landing-actualizado-web"

# ============================================================================
paso "3/6  Construir la imagen (sin caché)"
# ============================================================================
docker compose build --no-cache
if [ $? -ne 0 ]; then
  error "El build falló. El sitio NO se tocó."
  exit 1
fi
info "Imagen construida: $IMAGEN"

# ============================================================================
paso "4/6  Probar la imagen nueva en el puerto $PUERTO_PRUEBA (el sitio sigue igual)"
# ============================================================================
NOMBRE_PRUEBA="prueba-landing-$$"
docker rm -f "$NOMBRE_PRUEBA" >/dev/null 2>&1
docker run -d --rm --name "$NOMBRE_PRUEBA" -p "${PUERTO_PRUEBA}:80" "$IMAGEN" >/dev/null 2>&1
sleep 3

HTML=$(curl -s "http://127.0.0.1:${PUERTO_PRUEBA}/")

# El index.html que sirve nginx es solo una cáscara: tiene <div id="root"></div>
# y nada más. La página se dibuja después, con JavaScript. Por eso el formulario
# NO se busca en el HTML sino dentro del archivo JavaScript.
ASSET=$(echo "$HTML" | grep -o 'index-[A-Za-z0-9_-]*\.js' | head -1)
if [ -z "$ASSET" ]; then
  error "El HTML no referencia ningún JavaScript. NO se cambia nada."
  docker rm -f "$NOMBRE_PRUEBA" >/dev/null 2>&1
  exit 1
fi
info "La página referencia: $ASSET"

CODIGO_ASSET=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PUERTO_PRUEBA}/assets/$ASSET")
if [ "$CODIGO_ASSET" != "200" ]; then
  error "El JavaScript ($ASSET) no carga (HTTP $CODIGO_ASSET). NO se cambia nada."
  docker rm -f "$NOMBRE_PRUEBA" >/dev/null 2>&1
  exit 1
fi
info "El JavaScript carga bien (HTTP 200)"

# Ahora sí: el formulario de pedido tiene que estar dentro del JavaScript.
JS=$(curl -s "http://127.0.0.1:${PUERTO_PRUEBA}/assets/$ASSET")
if echo "$JS" | grep -q "formulario-pedido"; then
  info "El JavaScript trae el formulario de pedido."
else
  error "El JavaScript no trae el formulario de pedido. NO se cambia nada."
  docker rm -f "$NOMBRE_PRUEBA" >/dev/null 2>&1
  exit 1
fi

docker rm -f "$NOMBRE_PRUEBA" >/dev/null 2>&1

# ============================================================================
paso "5/6  Cambiar el contenedor"
# ============================================================================
docker stop "$CONTENEDOR" >/dev/null 2>&1
docker compose up -d
sleep 4
docker compose ps

# ============================================================================
paso "6/6  Verificar"
# ============================================================================
fallo=0

CODIGO_LOCAL=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PUERTO_LOCAL}/")
if [ "$CODIGO_LOCAL" = "200" ]; then
  info "OK   puerto ${PUERTO_LOCAL} -> 200"
else
  error "puerto ${PUERTO_LOCAL} -> $CODIGO_LOCAL"
  fallo=1
fi

CODIGO_DOMINIO=$(curl -s -o /dev/null -w '%{http_code}' "https://${DOMINIO}/")
if [ "$CODIGO_DOMINIO" = "200" ]; then
  info "OK   https://${DOMINIO} -> 200"
else
  error "https://${DOMINIO} -> $CODIGO_DOMINIO"
  fallo=1
fi

# El HTML es una cáscara vacía, así que el formulario se busca en el JS.
if [ "$CODIGO_DOMINIO" = "200" ]; then
  ASSET_FINAL=$(curl -s "https://${DOMINIO}/" | grep -o 'index-[A-Za-z0-9_-]*\.js' | head -1)
  if [ -n "$ASSET_FINAL" ] && \
     curl -s "https://${DOMINIO}/assets/$ASSET_FINAL" | grep -q "formulario-pedido"; then
    info "OK   el formulario está en la página ($ASSET_FINAL)"
  else
    error "el formulario NO aparece en el dominio"
    fallo=1
  fi
fi

if [ "$fallo" -ne 0 ]; then
  error "Algo no salió bien. Se restaura la imagen anterior."
  if [ -n "$IMAGEN_ANTERIOR" ]; then
    docker rm -f "$CONTENEDOR" >/dev/null 2>&1
    docker run -d --name "$CONTENEDOR" -p "${PUERTO_LOCAL}:80" --restart always \
      "$IMAGEN_ANTERIOR" >/dev/null
    echo -e "${AMARILLO}    El sitio volvió a la versión anterior (puerto ${PUERTO_LOCAL} funcionando).${FIN}"
    echo -e "${AMARILLO}    El dominio puede quedar sin HTTPS hasta que se repita:${FIN}"
    echo -e "${AMARILLO}        cd $CARPETA_NUEVA && docker compose up -d${FIN}"
  else
    error "No se pudo leer la imagen anterior. Mirá: docker compose logs"
  fi
  exit 1
fi

echo -e "${VERDE}=============================================${FIN}"
echo -e "${VERDE}  Listo. La landing quedó actualizada.${FIN}"
echo -e "${VERDE}=============================================${FIN}"
info "Versión instalada: $COMMIT"
info "En el navegador: Ctrl+Shift+R para ver el cambio."
echo ""
