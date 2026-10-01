#!/usr/bin/env bash
# ============================================================================
#  /actualizarlanding
#
#  Actualiza la landing a la última versión de GitHub sin dejar el sitio caído.
#
#  Cómo usarlo:
#      bash /docker/landing-nuevo/actualizarlanding.sh
#
#  Qué hace, en orden:
#    1. Descarga el código más reciente de la rama "home".
#    2. Construye la imagen Docker sin caché.
#    3. Prueba la imagen nueva en un puerto aparte (3002), sin tocar el
#       contenedor que está sirviendo. Si algo sale mal, se para acá y el
#       sitio sigue como estaba.
#    4. Cambia el contenedor por el nuevo.
#    5. Verifica que respondan el puerto 3001 y el dominio con HTTPS.
#    6. Si falla el paso 5, vuelve a la imagen anterior automáticamente.
#
#  Se ejecuta con:  bash actualizarlanding.sh
# ============================================================================

set -uo pipefail

# --- Configuración ---------------------------------------------------------
RAMA="home"
REPO="https://github.com/MagicSales2/Landing---Protector-solar.git"
CARPETA="/docker/landing-nuevo"
IMAGEN="landing-nuevo-web"
CONTENEDOR="anthelios_landing_web"
PUERTO_LOCAL="3001"
PUERTO_PRUEBA="3002"
DOMINIO="protectorsolar.skinoferta.cloud"
RED_TRAEFIK="traefik-proxy"

# --- Colores para leerlo rápido --------------------------------------------
VERDE='\033[0;32m'; ROJO='\033[0;31m'; AMARILLO='\033[0;33m'; GRIS='\033[0;90m'; FIN='\033[0m'
paso()  { echo -e "\n${VERDE}==> $1${FIN}"; }
info()  { echo -e "${GRIS}    $1${FIN}"; }
error() { echo -e "${ROJO}!!! $1${FIN}"; }

echo -e "${VERDE}=============================================${FIN}"
echo -e "${VERDE}  Actualizar la landing a la última versión${FIN}"
echo -e "${VERDE}=============================================${FIN}"

# ============================================================================
paso "1/6  Código más reciente de la rama $RAMA"
# ============================================================================
if [ -d "$CARPETA/.git" ]; then
  cd "$CARPETA" || exit 1
  git fetch origin "$RAMA" --quiet || { error "No se pudo bajar de GitHub"; exit 1; }
  # Si hay cambios locales sin commitear, no se pisan: se avisa y se para.
  if [ -n "$(git status --porcelain)" ]; then
    error "Hay cambios sin subir en $CARPETA. Revisalos antes de continuar."
    exit 1
  fi
  git reset --hard "origin/$RAMA" --quiet || { error "Falló el reset a origin/$RAMA"; exit 1; }
else
  cd /docker || exit 1
  git clone --branch "$RAMA" --depth 1 "$REPO" "$CARPETA" || { error "Falló el clone"; exit 1; }
  cd "$CARPETA" || exit 1
fi

COMMIT=$(git log --oneline -1)
info "Versión instalada: $COMMIT"

# Guardar la imagen actual para poder volver atrás.
IMAGEN_ANTERIOR=$(docker inspect "$CONTENEDOR" --format '{{.Image}}' 2>/dev/null || echo "")
if [ -n "$IMAGEN_ANTERIOR" ]; then
  info "Imagen anterior guardada: ${IMAGEN_ANTERIOR:0:20}..."
  echo "$IMAGEN_ANTERIOR" > /tmp/imagen-anterior-landing.txt
else
  info "No hay contenedor anterior (es la primera instalación)."
fi

# ============================================================================
paso "2/6  Construir la imagen (sin caché)"
# ============================================================================
docker compose build --no-cache
if [ $? -ne 0 ]; then
  error "El build falló. El sitio NO se tocó. Revisar el error de arriba."
  exit 1
fi
info "Imagen construida."

# ============================================================================
paso "3/6  Probar la imagen nueva en el puerto $PUERTO_PRUEBA (sin tocar el sitio)"
# ============================================================================
docker rm -f prueba-landing >/dev/null 2>&1
docker run -d --rm --name prueba-landing -p "${PUERTO_PRUEBA}:80" "$IMAGEN" >/dev/null 2>&1
sleep 3

HTML=$(curl -s "http://127.0.0.1:${PUERTO_PRUEBA}/")
if echo "$HTML" | grep -q "formulario-pedido"; then
  info "La página responde y trae el formulario de pedido."
else
  error "La imagen nueva no sirve el sitio correctamente. NO se cambia nada."
  docker rm -f prueba-landing >/dev/null 2>&1
  exit 1
fi

ASSET=$(echo "$HTML" | grep -o 'index-[A-Za-z0-9_-]*\.js' | head -1)
CODIGO_ASSET=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PUERTO_PRUEBA}/assets/$ASSET")
if [ "$CODIGO_ASSET" != "200" ]; then
  error "El JavaScript ($ASSET) no carga (HTTP $CODIGO_ASSET). NO se cambia nada."
  docker rm -f prueba-landing >/dev/null 2>&1
  exit 1
fi
info "JavaScript carga bien: $ASSET"
docker rm -f prueba-landing >/dev/null 2>&1

# ============================================================================
paso "4/6  Cambiar el contenedor que sirve"
# ============================================================================
docker stop "$CONTENEDOR" >/dev/null 2>&1
docker compose up -d
sleep 3
docker compose ps

# ============================================================================
paso "5/6  Verificar"
# ============================================================================
fallo=0

CODIGO_LOCAL=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PUERTO_LOCAL}/")
if [ "$CODIGO_LOCAL" = "200" ]; then
  info "OK   puerto $PUERTO_LOCAL -> 200"
else
  error "puerto $PUERTO_LOCAL -> $CODIGO_LOCAL"
  fallo=1
fi

CODIGO_DOMINIO=$(curl -s -o /dev/null -w '%{http_code}' "https://${DOMINIO}/")
if [ "$CODIGO_DOMINIO" = "200" ]; then
  info "OK   https://${DOMINIO} -> 200"
else
  error "https://${DOMINIO} -> $CODIGO_DOMINIO"
  fallo=1
fi

HTML_FINAL=$(curl -s "https://${DOMINIO}/")
if echo "$HTML_FINAL" | grep -q "formulario-pedido"; then
  info "OK   el formulario está en la página"
else
  error "el formulario NO aparece en el dominio"
  fallo=1
fi

# ============================================================================
if [ "$fallo" -ne 0 ]; then
  paso "6/6  Volver atrás"
  # ---------------------------------------------------------------------------
  if [ -n "$IMAGEN_ANTERIOR" ]; then
    error "Algo no salió bien. Se restaura la imagen anterior."
    docker rm -f "$CONTENEDOR" >/dev/null 2>&1
    docker run -d --name "$CONTENEDOR" -p "${PUERTO_LOCAL}:80" --restart always \
      "$IMAGEN_ANTERIOR" >/dev/null
    echo -e "${AMARILLO}El sitio volvió a la versión anterior. El dominio puede quedar"
    echo -e "${AMARILLO}sin HTTPS hasta que se vuelva a aplicar el compose:${FIN}"
    echo -e "${AMARILLO}    cd $CARPETA && docker compose up -d${FIN}"
  else
    error "No había imagen anterior. Revisar: docker compose logs"
  fi
  exit 1
fi

# ============================================================================
paso "6/6  Listo"
# ============================================================================
echo -e "${VERDE}    La landing quedó actualizada y funcionando.${FIN}"
info "Versión: $COMMIT"
info "Podés borrarte de las pestañas viejas y usar Ctrl+Shift+R para"
info "ver el cambio (el navegador guarda la versión anterior)."
echo ""
