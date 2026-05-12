import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const repoRoot = path.resolve(__dirname, "..", "..");
const dataDir = path.join(repoRoot, "site", "src", "data");
const outputPath = path.join(dataDir, "github-data.json");
const cachePath = path.join(dataDir, "github-cache.json");

const repo = process.env.GITHUB_REPO || "boreddevnl/BoredOS";
const [owner, name] = repo.split("/");

const headers = {
  "User-Agent": "boredos-site"
};

if (process.env.GITHUB_TOKEN) {
  headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
}

const fetchJson = async (url) => {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`GitHub API error ${response.status} for ${url}`);
  }
  return response.json();
};

const loadCache = async () => {
  try {
    const raw = await fs.readFile(cachePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const saveJson = async (target, payload) => {
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(payload, null, 2));
};

const main = async () => {
  const cache = await loadCache();

  try {
    const [contributors, latestRelease] = await Promise.all([
      fetchJson(`https://api.github.com/repos/${owner}/${name}/contributors?per_page=100`),
      fetchJson(`https://api.github.com/repos/${owner}/${name}/releases/latest`)
    ]);

    const payload = {
      contributors: contributors.map((contributor) => ({
        login: contributor.login,
        avatar_url: contributor.avatar_url,
        html_url: contributor.html_url,
        contributions: contributor.contributions
      })),
      latestRelease: {
        name: latestRelease.name || latestRelease.tag_name,
        tag_name: latestRelease.tag_name,
        html_url: latestRelease.html_url,
        published_at: latestRelease.published_at,
        body: latestRelease.body || "",
        iso_url: latestRelease.assets?.find(a => a.name.endsWith(".iso"))?.browser_download_url
      }
    };

    await saveJson(outputPath, payload);
    await saveJson(cachePath, payload);
    console.log("GitHub data fetched.");
  } catch (error) {
    const fallback = cache || {
      contributors: [],
      latestRelease: {
        name: "BoredOS",
        tag_name: "",
        html_url: `https://github.com/${owner}/${name}/releases`,
        published_at: "",
        body: "Release info unavailable."
      }
    };

    await saveJson(outputPath, fallback);
    console.warn("GitHub fetch failed, using cached data.", error.message);
  }
};

main().catch((error) => {
  console.error("GitHub data sync failed:", error);
  process.exit(1);
});
