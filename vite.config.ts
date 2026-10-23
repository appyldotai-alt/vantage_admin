import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { quasar, transformAssetUrls } from '@quasar/vite-plugin';
import { cloudflare } from '@cloudflare/vite-plugin';

// Local dev runs under `with-secrets.mjs express-dev` (package.json), so the local Hyperdrive binding uses the
// PlanetScale dev branch, like the local API. The URL stays in the process; it is never written to disk.
if (process.env.DATABASE_URL && !process.env.CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_DB) {
  process.env.CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_DB = process.env.DATABASE_URL;
}

export default defineConfig({
  plugins: [vue({ template: { transformAssetUrls } }), quasar(), cloudflare()],
});
