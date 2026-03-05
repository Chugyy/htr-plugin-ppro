import { defineConfig, loadEnv } from 'vite';
import { resolve } from 'path';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    root: './',
    build: {
      outDir: mode === 'production' ? 'build/prod' : 'build/dev',
      emptyOutDir: true,
      lib: {
        entry: resolve(__dirname, 'src/ui/main.ts'),
        name: 'HTRPlugin',
        formats: ['iife'],
        fileName: () => 'index.js',
        cssFileName: 'style',
      },
    },
    define: {
      'import.meta.env.VITE_BACKEND_URL': JSON.stringify(env.VITE_BACKEND_URL),
      'import.meta.env.VITE_MODE': JSON.stringify(mode),
    },
    resolve: {
      alias: { '@': resolve(__dirname, './src') }
    },
    plugins: [
      viteStaticCopy({
        targets: [
          { src: 'manifest.json',       dest: '.' },
          { src: 'index.html',          dest: '.' },
          { src: 'src/ui/pages/*.html', dest: 'pages' },
        ]
      })
    ]
  };
});
