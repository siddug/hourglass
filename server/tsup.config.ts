import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/bin/server.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  treeshake: true,
  target: 'node20',
  outDir: 'dist',
  external: ['better-sqlite3'],
  onSuccess: 'mkdir -p dist/bin/migrations && cp -r src/db/migrations/* dist/bin/migrations/',
});
