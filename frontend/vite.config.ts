import { defineConfig } from 'vite';
import { resolve } from 'path';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  root: './',
  build: {
    outDir: 'build',
    emptyOutDir: true,
    lib: {
      entry: resolve(__dirname, 'src/ui/main.ts'),
      name: 'HTRPlugin',
      formats: ['iife'],
      fileName: () => 'index.js',
      cssFileName: 'style',
    },
  },
  resolve: {
    alias: { '@': resolve(__dirname, './src') }
  },
  plugins: [
    viteStaticCopy({
      targets: [
        { src: 'manifest.json',    dest: '.' },
        { src: 'index.html',       dest: '.' },
        { src: 'src/ui/pages/*.html', dest: 'pages' },
      ]
    })
  ]
});
