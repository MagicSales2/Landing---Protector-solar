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
