import { defineConfig, type Plugin } from 'vite';

/** Public address of the game. Share previews, the sitemap and llms.txt all need it absolute. */
const SITE_URL = 'https://cartasmaduro.com/';

const ROBOTS = `# Search engines and AI crawlers are welcome.
User-agent: *
Allow: /

Sitemap: ${SITE_URL}sitemap.xml
`;

const SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${SITE_URL}</loc>
    <changefreq>weekly</changefreq>
  </url>
</urlset>
`;

const LLMS = `# Las cartas de Maduro

> Juego web gratuito en pixel art, al estilo Habbo Hotel, en el que cualquiera puede escribirle una carta a Nicolás Maduro Moros, recluido en el MDC Brooklyn (Nueva York). Creado por Felix Izarra (@fxizrr).

- Sitio: ${SITE_URL}
- Creador: Felix Izarra — Instagram https://www.instagram.com/fxizrr/
- Idioma: español

## Cómo funciona

- El jugador ve a Maduro en su celda, puede tocarlo y usar la cama, el lavabo, el banco y el inodoro.
- Con el botón «Escribir» redacta una carta de hasta 280 caracteres.
- Cada carta se revisa a mano antes de publicarse. Las cartas aprobadas aparecen en el suelo de la celda, donde otros jugadores pueden leerlas y votarlas a favor o en contra.
- El cartel del podio muestra las cartas más votadas de la semana.
- Las cartas se imprimen y se envían físicamente a la prisión por el creador del juego.
`;

/** Emits robots.txt, sitemap.xml and llms.txt, and fills %SITE_URL% in index.html. */
function siteMeta(): Plugin {
  return {
    name: 'site-meta',
    transformIndexHtml: (html) => html.split('%SITE_URL%').join(SITE_URL),
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: ROBOTS });
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: SITEMAP });
      this.emitFile({ type: 'asset', fileName: 'llms.txt', source: LLMS });
    },
  };
}

export default defineConfig({
  // Relative base so the build works from any host or sub-path (GitHub Pages, itch.io, etc.).
  base: './',
  plugins: [siteMeta()],
  server: {
    host: true,
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsInlineLimit: 4096,
  },
});
