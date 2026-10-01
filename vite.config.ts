import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    // GitHub Pages sirve el proyecto en /Landing---Protector-solar/.
    // Hostinger (o cualquier hosting normal) lo sirve en la raíz del dominio,
    // y por eso basta con NO poner GITHUB_PAGES al compilar: así el mismo
    // código sale para los dos sitios.
    base: process.env.GITHUB_PAGES ? '/Landing---Protector-solar/' : '/',
    plugins: [react(), tailwindcss()],
    build: {
      // Los nombres llevan hash (comportamiento por defecto de Vite):
      // assets/index-a1b2c3.js. Si el contenido cambia, el nombre cambia, y por
      // eso el .htaccess puede cachear esos archivos para un año con
      // "immutable" sin riesgo. El index.html es el único que va sin caché y
      // siempre apunta al archivo nuevo, así que una actualización se ve al
      // instante. IMPORTANTE: no quitar el hash sin cambiar a la vez la regla
      // de caché, o los visitantes quedaron viendo la versión vieja del sitio.
      rollupOptions: {
        output: {
          assetFileNames: 'assets/[name]-[hash][extname]',
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
