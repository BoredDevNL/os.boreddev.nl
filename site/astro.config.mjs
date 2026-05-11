import { defineConfig } from "astro/config";

const siteUrl = process.env.ASTRO_SITE || "https://os.boreddev.nl";
const basePath = process.env.ASTRO_BASE || "/";

export default defineConfig({
  site: siteUrl,
  base: basePath,
  output: "static",
  trailingSlash: "never"
});
