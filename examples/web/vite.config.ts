import react from '@vitejs/plugin-react';
import { defaultClientConditions, defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Resolve @watari/* workspace packages to their TypeScript sources.
    conditions: ['source', ...defaultClientConditions],
    dedupe: ['react', 'react-dom'],
  },
});
