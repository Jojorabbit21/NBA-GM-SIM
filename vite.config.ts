
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, process.cwd(), '');
  
  return {
    plugins: [react()],
    define: {
      // Define process.env to allow existing code using process.env.API_KEY to work.
      // MUST stringify the env object so values are treated as strings, not identifiers.
      'process.env': JSON.stringify(env)
    },
    build: {
      outDir: 'build', // Match CRA output directory for convenience
      chunkSizeWarningLimit: 1000, // Increase limit to 1000KB to reduce noise for intentional large chunks
      rollupOptions: {
        output: {
          manualChunks(id) {
            // Split node_modules
            if (id.includes('node_modules')) {
              // Core React
              if (id.includes('react') || id.includes('react-dom')) {
                return 'react-vendor';
              }
              // Data & DB Utils
              if (id.includes('@supabase') || id.includes('@tanstack')) {
                return 'db-vendor';
              }
              // UI Icons
              if (id.includes('lucide-react')) {
                return 'ui-vendor';
              }
              // AI SDK (Usually Large)
              if (id.includes('@google/genai')) {
                return 'ai-vendor';
              }
              // Analytics
              if (id.includes('react-ga4') || id.includes('@vercel/speed-insights')) {
                 return 'analytics-vendor';
              }
              
              // All other node_modules
              return 'vendor';
            }
          }
        }
      }
    }
  }
})
