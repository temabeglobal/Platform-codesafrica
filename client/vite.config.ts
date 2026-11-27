import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/* Hors connexion : une fois le build écrit, génère dist/sw.js avec la liste de tous les fichiers de l'application
   (JS, CSS, images…) pour qu'ils soient gardés sur l'appareil. La version change dès qu'un fichier change. */
function offlineServiceWorker(): Plugin {
  let outDir = 'dist';
  const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
  return {
    name: 'offline-service-worker',
    apply: 'build',
    configResolved(c) { outDir = resolve(c.root, c.build.outDir); },
    closeBundle() {
      const files = walk(outDir)
        .map((p) => relative(outDir, p).split('\\').join('/'))
        .filter((f) => f !== 'sw.js' && !f.endsWith('.map') && !f.split('/').some((part) => part.startsWith('_') || part.startsWith('.')))
        .sort();
      const hash = createHash('sha256');
      for (const f of files) hash.update(f).update(readFileSync(join(outDir, f)));
      const html = readFileSync(join(outDir, 'index.html'), 'utf8');
      const fontCss = html.match(/href="(https:\/\/fonts\.googleapis\.com\/css2[^"]+)"/)?.[1].replace(/&amp;/g, '&') ?? '';
      const source = readFileSync(join(__dirname, 'sw-template.js'), 'utf8')
        .replace('__VERSION__', hash.digest('hex').slice(0, 12))
        .replace('__ASSETS__', JSON.stringify(['/', ...files.map((f) => `/${f}`)]))
        .replace('__FONT_CSS__', fontCss);
      writeFileSync(join(outDir, 'sw.js'), source);
    },
  };
}

export default defineConfig({ plugins: [react(), offlineServiceWorker()], server: { port: 5181, strictPort: true } });
