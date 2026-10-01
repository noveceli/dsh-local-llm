import { defineConfig } from 'tsdown'

const PKG_ID = 'dsh-local-llm'

/**
 * Two faces in one config:
 *  - host: plain Node ESM bundle, @deepseek-ai/* stays external
 *  - client: the shell's closure-factory client bundle
 *    (window.__ModuleLoader__.load({id, factory:(require)=>...})),
 *    all @deepseek-ai/* and react stay external — the shell
 *    seeds them into the injected require.
 */
export default defineConfig([
  {
    name: `${PKG_ID}/host`,
    entry: { index: 'src/index.ts' },
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    dts: false,
    clean: false,
    sourcemap: false,
    external: [/^@deepseek-ai\//],
  },
  {
    name: `${PKG_ID}/client`,
    entry: { client: 'src/client/index.tsx' },
    outDir: 'lib',
    format: ['cjs'],
    platform: 'browser',
    target: 'es2024',
    dts: false,
    clean: false,
    sourcemap: false,
    external: [/^react$/, /^react\/jsx-runtime$/, /^react-dom$/, /^@deepseek-ai\//],
    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PKG_ID)}, factory: (require) => {`,
      intro: 'var module = { exports: {} }; var exports = module.exports;',
      footer: 'return module.exports; } });',
    },
  },
])
