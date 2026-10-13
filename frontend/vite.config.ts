import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const backendTarget = env.VITE_BACKEND_URL || 'http://backend:5000';

  return {
    plugins: [react()],
    build: {
      rollupOptions: {
        output: {
          // Long-lived vendor chunks so app updates don't invalidate cached libraries
          manualChunks: {
            react: ['react', 'react-dom'],
            map: ['leaflet'],
            realtime: ['socket.io-client'],
          },
        },
      },
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
      watch: {
        usePolling: true,
      },
      proxy: {
        '/api': {
          target: backendTarget,
          changeOrigin: true,
        },
        '/uploads': {
          target: backendTarget,
          changeOrigin: true,
        },
        '/socket.io': {
          target: backendTarget,
          changeOrigin: true,
          ws: true,
        },
      },
    },
  };
});
