import path from "path"
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  base: '/admin/',
  plugins: [react(), tailwindcss()],
  // Allow WAAAH_* env vars to be exposed to the client (in addition to VITE_*)
  envPrefix: ['VITE_', 'WAAAH_'],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Proxy API calls to MCP server during dev
      '/admin/agents': 'http://localhost:3000',
      '/admin/tasks': 'http://localhost:3000',
      '/admin/bot': 'http://localhost:3000',
      '/admin/stats': 'http://localhost:3000',
    },
  },
  build: {
    outDir: '../mcp-server/public',
    emptyOutDir: true,
  },
})
