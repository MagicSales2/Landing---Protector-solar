#!/usr/bin/env bash
# ============================================================================
#  /actualizarlanding
#
#  Actualiza la landing a la última versión de GitHub.
#
#  Cómo usarlo (copiar y pegar las dos líneas en la terminal):
#      cd /tmp
#      curl -fsSL "https://api.github.com/repos/MagicSales2/Landing---Protector-solar/contents/actualizarlanding.sh?ref=home" | sed -n 's/^ *"content": *"\(.*\)",$/\1/p' | sed 's/\\n//g' | base64 -d > actualizarlanding.sh
#      bash actualizarlanding.sh
#
#  Ojo con esto: la descarga va por la API de GitHub y NO por
#  raw.githubusercontent.com. A propósito. La otra forma falla: GitHub
#  guarda copia de sus archivos en servidores de caché y a veces sirve la
#  versión vieja del script aunque ya haya un push nuevo. Con esa versión
#  vieja el script se trababa siempre en el mismo paso.
#
#  Qué hace, en orden:
#    1. Baja el código más reciente de la rama "home" en una carpeta limpia.
#    2. Construye la imagen Docker sin caché.
#    3. Apaga el contenedor viejo (lo busca por el PUERTO, no por el nombre).
#    4. Levanta el contenedor nuevo.
#    5. Verifica el puerto y el dominio. Traefik tarda unos segundos en
#       enterarse del contenedor nuevo, así que reintenta varias veces.
#    6. Si no levanta, vuelve atrás solo con la imagen anterior.
# ============================================================================

set -uo pipefail

# --- Datos del sitio -------------------------------------------------------
REPO="https://github.com/MagicSales2/Landing---Protector-solar.git"
RAMA="home"
DOMINIO="protectorsolar.skinoferta.cloud"
PUERTO="3001"
CONTENEDOR="landing-protector-solar1"
CARPETA="/docker/landing-codigo"
ARCHIVO_IMAGEN_ANTERIOR="/tmp/imagen-anterior-landing.txt"

# --- Colores ---------------------------------------------------------------
VERDE='\033[0;32m'; ROJO='\033[0;31m'; AMARILLO='\033[0;33m'; GRIS='\033[0;90m'; FIN='\033[0m'
paso()  { echo -e "\n${VERDE}==> $1${FIN}"; }
info()  { echo -e "${GRIS}    $1${FIN}"; }
error() { echo -e "${ROJO}!!! $1${FIN}"; }

# Si se interrumpe el script (Ctrl+C) después de apagar el contenedor viejo,
# el sitio se queda caído. Este trampa lo vuelve a levantar antes de salir.
SITIO_ABAJO=0
al_salir() {
  if [ "$SITIO_ABAJO" = "1" ]; then
    echo ""
    echo -e "${AMARILLO}    Se interrumpió la actualización. Se levanta el sitio.${FIN}"
    if [ -n "${IMAGEN_ANTERIOR:-}" ]; then
      docker rm -f "$CONTENEDOR" >/dev/null 2>&1
      docker run -d --name "$CONTENEDOR" -p "${PUERTO}:80" --restart always \
        "$IMAGEN_ANTERIOR" >/dev/null 2>&1
      echo -e "${AMARILLO}    El sitio volvió a la versión anterior en el puerto ${PUERTO}.${FIN}"
      echo -e "${AMARILLO}    Para que el dominio también vuelva:${FIN}"
      echo -e "${AMARILLO}        cd ${CARPETA} && docker compose up -d${FIN}"
    fi
  fi
  exit 1
}
trap al_salir INT TERM

echo -e "${VERDE}=============================================${FIN}"
echo -e "${VERDE}   /actualizarlanding${FIN}"
echo -e "${VERDE}=============================================${FIN}"

# ============================================================================
paso "1/5  Descargar la versión más reciente"
# ============================================================================

if [ ! -d /docker ]; then
  error "No existe la carpeta /docker en este servidor. No se tocó nada."
  exit 1
fi

cd /docker || exit 1
rm -rf "$CARPETA"

if ! git clone --branch "$RAMA" --depth 1 "$REPO" "$CARPETA" 2>/dev/null; then
  error "No se pudo descargar el código de GitHub. El sitio NO se tocó."
  exit 1
fi

cd "$CARPETA" || exit 1
COMMIT=$(git log --oneline -1)
info "Versión a instalar: $COMMIT"

# El nombre del contenedor tiene que ser este. Si el archivo viniera con otro
# nombre, se corrige acá, porque si no los dos contenedores chocan por el 3001.
sed -i "s/container_name:.*/container_name: ${CONTENEDOR}/" docker-compose.yml

# ============================================================================
paso "2/5  Construir la imagen (tarda unos 20 segundos)"
# ============================================================================

if ! docker compose build --no-cache >/dev/null 2>&1; then
  error "El build falló. El sitio NO se tocó, sigue como estaba."
  info "Para ver el error:  cd $CARPETA && docker compose build --no-cache"
  exit 1
fi
info "Imagen construida correctamente"

# Guardar la imagen que está corriendo ahora, por si hay que volver atrás.
IMAGEN_ANTERIOR=$(docker inspect "$CONTENEDOR" --format '{{.Image}}' 2>/dev/null || echo "")
if [ -n "$IMAGEN_ANTERIOR" ]; then
  echo "$IMAGEN_ANTERIOR" > "$ARCHIVO_IMAGEN_ANTERIOR"
  info "Imagen anterior guardada (para poder volver atrás)"
fi

# ============================================================================
paso "3/5  Cambiar el contenedor"
# ============================================================================

# Se apaga lo que esté ocupando el puerto 3001, llámese como se llame.
# Esto es lo que hace el comando a mano que usamos:
#     docker ps -q --filter publish=3001 | xargs -r docker rm -f
APAGADOS=$(docker ps -q --filter "publish=${PUERTO}" | xargs -r docker rm -f 2>/dev/null | wc -l)
if [ "$APAGADOS" -gt 0 ]; then
  info "Contenedor anterior apagado"
else
  info "No había ningún contenedor en el puerto ${PUERTO}"
fi

if ! docker compose up -d >/dev/null 2>&1; then
  SITIO_ABAJO=1
  error "El contenedor no arrancó. Se intenta volver atrás."
  docker compose logs --tail 20 2>&1 | sed 's/^/    /'
  if [ -n "$IMAGEN_ANTERIOR" ]; then
    docker rm -f "$CONTENEDOR" >/dev/null 2>&1
    docker run -d --name "$CONTENEDOR" -p "${PUERTO}:80" --restart always \
      "$IMAGEN_ANTERIOR" >/dev/null 2>&1
    SITIO_ABAJO=0
    echo -e "${AMARILLO}    Se restauró la imagen anterior en el puerto ${PUERTO}.${FIN}"
  fi
  exit 1
fi
SITIO_ABAJO=1
info "Contenedor '${CONTENEDOR}' arriba"

# ============================================================================
paso "4/5  Verificar"
# ============================================================================

# Traefik no se entera del contenedor nuevo al instante: puede dar 404 los
# primeros segundos. Por eso se reintenta en lugar de dar por fallido.
# Puerto y dominio van juntos: el primero tiene que estar 200 antes de mirar
# el segundo, porque si el contenedor no responde el dominio tampoco.
verificar() {
  local i codigo_local codigo_dominio
  for i in $(seq 1 12); do
    codigo_local=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 \
      "http://127.0.0.1:${PUERTO}/")
    if [ "$codigo_local" = "200" ]; then
      codigo_dominio=$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 \
        "https://${DOMINIO}/")
      if [ "$codigo_dominio" = "200" ]; then
        return 0
      fi
      echo -e "${GRIS}    intento ${i}: puerto OK, dominio ${codigo_dominio} (Traefik todavía no)${FIN}"
    else
      echo -e "${GRIS}    intento ${i}: puerto ${codigo_local}${FIN}"
    fi
    sleep 5
  done
  return 1
}

if verificar; then
  info "puerto ${PUERTO} -> 200"
  info "https://${DOMINIO} -> 200"
else
  echo ""
  error "El sitio no respondió bien. Se restaura la imagen anterior."
  if [ -n "$IMAGEN_ANTERIOR" ]; then
    docker compose down >/dev/null 2>&1
    docker rm -f "$CONTENEDOR" >/dev/null 2>&1
    docker run -d --name "$CONTENEDOR" -p "${PUERTO}:80" --restart always \
      "$IMAGEN_ANTERIOR" >/dev/null 2>&1
    SITIO_ABAJO=0
    echo -e "${AMARILLO}    El sitio volvió a la versión anterior en el puerto ${PUERTO}.${FIN}"
    echo -e "${AMARILLO}    Para que el dominio vuelva a funcionar:${FIN}"
    echo -e "${AMARILLO}        cd $CARPETA && docker compose up -d${FIN}"
  else
    error "No se pudo leer la imagen anterior. Revisá: docker ps -a"
  fi
  exit 1
fi
SITIO_ABAJO=0

# Que el formulario esté en el JavaScript es un AVISO, no un error: el index.html
# es una cáscara vacía y la página se dibuja con JavaScript.
ASSET=$(curl -s "https://${DOMINIO}/" | grep -o 'index-[A-Za-z0-9_-]*\.js' | head -1)
if [ -n "$ASSET" ]; then
  info "JavaScript del sitio: $ASSET"
  if curl -s "https://${DOMINIO}/assets/$ASSET" | grep -q "formulario-pedido"; then
    info "El formulario está presente"
  else
    echo -e "${AMARILLO}    Aviso: no se vio 'formulario-pedido' en el JavaScript.${FIN}"
    echo -e "${AMARILLO}    Si al abrir el sitio se ve bien, no te preocupes.${FIN}"
  fi
fi

# ============================================================================
paso "5/5  Listo"
# ============================================================================

echo -e "${VERDE}=============================================${FIN}"
echo -e "${VERDE}   La landing quedó actualizada.${FIN}"
echo -e "${VERDE}=============================================${FIN}"
info "Versión instalada: $COMMIT"
echo -e "${VERDE}    En el navegador: Ctrl+Shift+R para ver el cambio.${FIN}"
echo ""
