import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// Two build targets from one codebase:
//   npm run build         -> dist/        normal PWA build (deploy to Netlify/Vercel/Pages)
//   npm run build:single  -> dist-single/ one self-contained .html file
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react(), ...(mode === 'single' ? [viteSingleFile()] : [])],
  // A build-time (not runtime) stamp, shown in Settings — so "did my deploy
  // actually reach the phone" is something you can check, not guess at.
  define: { __BUILD_TIME__: JSON.stringify(new Date().toISOString()) },
  build: {
    outDir: mode === 'single' ? 'dist-single' : 'dist',
    emptyOutDir: true,
    target: 'es2020',
  },
}))
