import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const repoRoot = path.resolve(__dirname, "..", "..");
const dataDir = path.join(repoRoot, "site", "src", "data");
const outputPath = path.join(dataDir, "github-data.json");
const cachePath = path.join(dataDir, "github-cache.json");

const repo = process.env.GITHUB_REPO || "BoredOS/BoredOS";
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

const fetchAllPages = async (url) => {
  const results = [];
  const pageSize = 100;

  for (let page = 1; ; page += 1) {
    const pageUrl = new URL(url);
    pageUrl.searchParams.set("per_page", String(pageSize));
    pageUrl.searchParams.set("page", String(page));

    const items = await fetchJson(pageUrl.toString());
    if (!Array.isArray(items) || items.length === 0) {
      break;
    }

    results.push(...items);
    if (items.length < pageSize) {
      break;
    }
  }

  return results;
};

const aggregateContributors = async (repos) => {
  const contributorsByLogin = new Map();

  for (const repoInfo of repos) {
    const repoContributors = await fetchAllPages(
      `https://api.github.com/repos/${repoInfo.full_name}/contributors?anon=1`
    ).catch(() => []);

    for (const contributor of repoContributors) {
      const loginKey = (contributor.login || contributor.html_url || "").toLowerCase();
      if (!loginKey) {
        continue;
      }

      const current = contributorsByLogin.get(loginKey) || {
        login: contributor.login || "",
        avatar_url: contributor.avatar_url || "",
        html_url: contributor.html_url || "",
        contributions: 0
      };

      current.login = current.login || contributor.login || "";
      current.avatar_url = current.avatar_url || contributor.avatar_url || "";
      current.html_url = current.html_url || contributor.html_url || "";
      current.contributions += contributor.contributions || 0;

      contributorsByLogin.set(loginKey, current);
    }
  }

  return Array.from(contributorsByLogin.values()).sort(
    (a, b) => b.contributions - a.contributions || a.login.localeCompare(b.login)
  );
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
    const [latestRelease, nightlyRelease] = await Promise.all([
      fetchJson(`https://api.github.com/repos/${owner}/${name}/releases/latest`),
      fetchJson(`https://api.github.com/repos/${owner}/${name}/releases/tags/nightly`).catch(() => null)
    ]);

    const repos = [{ full_name: `${owner}/${name}` }];
    const contributors = await aggregateContributors(repos);

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
      },
      nightlyRelease: nightlyRelease ? {
        name: nightlyRelease.name || nightlyRelease.tag_name,
        tag_name: nightlyRelease.tag_name,
        html_url: nightlyRelease.html_url,
        published_at: nightlyRelease.published_at,
        body: nightlyRelease.body || "",
        iso_url: nightlyRelease.assets?.find(a => a.name.endsWith(".iso"))?.browser_download_url
      } : null
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
