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
      // Nombres sin hash en la carpeta: permite cachear los assets para
      // siempre y dejar solo index.html como "no cachear".
      rollupOptions: {
        output: {
          entryFileNames: 'assets/app.js',
          chunkFileNames: 'assets/[name].js',
          assetFileNames: 'assets/[name][extname]',
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
