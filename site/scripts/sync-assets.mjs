import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const repoRoot = path.resolve(__dirname, "..", "..");
const sourceDir = path.join(repoRoot, "branding");
const destDir = path.join(repoRoot, "site", "public", "branding");

const ensureDir = async (dir) => {
  await fs.mkdir(dir, { recursive: true });
};

const copyFile = async (src, dest) => {
  await fs.copyFile(src, dest);
};

const copyDir = async (src, dest) => {
  await ensureDir(dest);
  const entries = await fs.readdir(src, { withFileTypes: true });
  let count = 0;

  for (const entry of entries) {
    if (entry.name.startsWith(".")) {
      continue;
    }

    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      count += await copyDir(srcPath, destPath);
    } else if (entry.isFile()) {
      await copyFile(srcPath, destPath);
      count += 1;
    }
  }

  return count;
};

const main = async () => {
  await ensureDir(destDir);

  const assetCount = await copyDir(sourceDir, destDir);

  const faviconSource = path.join(destDir, "bOS9.png");
  const faviconDest = path.join(repoRoot, "site", "public", "favicon.png");
  try {
    await copyFile(faviconSource, faviconDest);
  } catch (error) {
    console.warn("Favicon not copied:", error.message);
  }

  console.log(`Synced ${assetCount} branding assets.`);
};

main().catch((error) => {
  console.error("Asset sync failed:", error);
  process.exit(1);
});
