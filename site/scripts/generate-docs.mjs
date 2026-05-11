import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import { visit } from "unist-util-visit";
import { toString } from "mdast-util-to-string";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const repoRoot = path.resolve(__dirname, "..", "..");
const outputDir = path.join(repoRoot, "site", "src", "generated", "docs");
const dataDir = path.join(repoRoot, "site", "src", "data");
const cachePath = path.join(dataDir, "docs-cache.json");

const GITHUB_OWNER = "BoredDevNL";
const GITHUB_REPO = "BoredOS";
const DOCS_PATH = "docs";

const headers = {
  "User-Agent": "boredos-site"
};

if (process.env.GITHUB_TOKEN) {
  headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
}

const fetchJson = async (url) => {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    if (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0") {
      throw new Error("GitHub API rate limit exceeded. Please provide a GITHUB_TOKEN.");
    }
    throw new Error(`GitHub API error ${response.status} for ${url}`);
  }
  return response.json();
};

const fetchText = async (url) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Fetch error ${response.status} for ${url}`);
  }
  return response.text();
};

const collectRemoteMarkdown = async () => {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/trees/main?recursive=1`;
  const data = await fetchJson(url);
  const results = [];

  for (const item of data.tree) {
    if (item.type === "blob" && item.path.startsWith(DOCS_PATH + "/") && item.path.endsWith(".md")) {
      results.push({
        path: item.path,
        download_url: `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/main/${item.path}`,
        sha: item.sha
      });
    }
  }

  return results;
};

const slugFromPath = (filePath) => {
  let relative = filePath;
  if (relative.startsWith(DOCS_PATH + "/")) {
    relative = relative.slice(DOCS_PATH.length + 1);
  } else if (relative === DOCS_PATH || relative === "README.md") {
    relative = "README.md";
  }

  if (relative.toLowerCase() === "readme.md") {
    return "";
  }
  if (relative.toLowerCase().endsWith("/readme.md")) {
    return relative.slice(0, -"/readme.md".length);
  }
  return relative.replace(/\.md$/, "");
};

const createAdmonitions = () => (tree) => {
  visit(tree, "blockquote", (node) => {
    const first = node.children?.[0];
    if (!first || first.type !== "paragraph") {
      return;
    }

    const rawText = toString(first).trim();
    const match = rawText.match(/^\[!(NOTE|IMPORTANT|CAUTION|WARNING|TIP)\]\s*/i);
    if (!match) {
      return;
    }

    const label = match[1].toLowerCase();
    const title = match[1].toUpperCase();

    first.children = first.children.map((child) => {
      if (child.type === "text" && child.value.includes(match[0])) {
        return { ...child, value: child.value.replace(match[0], "").trimStart() };
      }
      return child;
    });

    node.data = {
      hName: "div",
      hProperties: {
        class: `admonition ${label}`
      }
    };

    node.children.unshift({
      type: "paragraph",
      children: [{ type: "text", value: title }],
      data: {
        hName: "div",
        hProperties: { class: "admonition-title" }
      }
    });
  });
};

const rewriteLinks = (currentFilePath) => () => (tree) => {
  visit(tree, "link", (node) => {
    const url = node.url || "";
    if (url.startsWith("http") || url.startsWith("#") || url.startsWith("mailto:")) {
      return;
    }

    if (!url.endsWith(".md")) {
      return;
    }

    const dir = path.dirname(currentFilePath);
    const resolved = path.join(dir, url).replace(/\\/g, "/");
    
    if (!resolved.startsWith(DOCS_PATH)) {
      return;
    }

    const slug = slugFromPath(resolved);
    if (!slug) {
      node.url = "/docs";
    } else {
      node.url = `/docs/${slug}`;
    }
  });
};

const extractTitleAndDescription = (tree, fallbackTitle) => {
  let title = fallbackTitle;
  let description = "";

  for (let i = 0; i < tree.children.length; i += 1) {
    const node = tree.children[i];
    if (node.type === "heading" && node.depth === 1) {
      title = toString(node);
      tree.children.splice(i, 1);
      break;
    }
  }

  for (const node of tree.children) {
    if (node.type === "paragraph") {
      description = toString(node).trim();
      break;
    }
  }

  return { title, description };
};

const buildHtml = async (filePath, content) => {
  let title = "";
  let description = "";
  let textContent = "";

  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(createAdmonitions)
    .use(rewriteLinks(filePath))
    .use(() => (tree) => {
      const fallback = path.basename(filePath, ".md");
      const meta = extractTitleAndDescription(tree, fallback);
      title = meta.title;
      description = meta.description;
      textContent = toString(tree).replace(/\s+/g, " ").trim().toLowerCase();
    })
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeSlug)
    .use(rehypeAutolinkHeadings, { behavior: "append" })
    .use(rehypeStringify, { allowDangerousHtml: true });

  const file = await processor.process(content);
  return {
    html: String(file),
    title,
    description,
    content: textContent
  };
};

const parseSidebar = (content, validSlugs) => {
  const lines = content.split(/\r?\n/);
  const sections = [];
  let currentSection = null;
  let currentGroup = null;

  const toSlug = (href) => {
    if (!href || href.endsWith("/")) {
      return "";
    }
    // Handle relative links in sidebar
    const resolved = path.join(DOCS_PATH, href).replace(/\\/g, "/");
    return slugFromPath(resolved);
  };

  for (const line of lines) {
    const sectionMatch = line.match(/^###\s+\d+\.\s+\[([^\]]+)\]/);
    if (sectionMatch) {
      currentSection = { title: sectionMatch[1], items: [] };
      sections.push(currentSection);
      currentGroup = null;
      continue;
    }

    const groupMatch = line.match(/^####\s+(.+)/);
    if (groupMatch && currentSection) {
      currentGroup = { title: groupMatch[1].trim(), items: [] };
      currentSection.items.push(currentGroup);
      continue;
    }

    const linkMatch = line.match(/^-\s+\[`([^`]+)`\]\(([^)]+)\)/);
    if (linkMatch && currentSection) {
      const title = linkMatch[1];
      const href = linkMatch[2];
      const slug = toSlug(href);
      if (!slug && href !== "README.md" && href !== "./README.md") {
        if (!validSlugs.has("")) continue;
      } else if (slug && !validSlugs.has(slug)) {
        continue;
      }
      const item = { title, slug: slug || "" };
      if (currentGroup) {
        currentGroup.items.push(item);
      } else {
        currentSection.items.push(item);
      }
    }
  }

  return sections;
};

const main = async () => {
  console.log("Fetching documentation from GitHub...");
  
  let cache = {};
  try {
    const rawCache = await fs.readFile(cachePath, "utf-8");
    cache = JSON.parse(rawCache);
  } catch (e) {
    // No cache or invalid cache
  }

  let remoteFiles;
  try {
    remoteFiles = await collectRemoteMarkdown();
  } catch (error) {
    if (Object.keys(cache).length > 0) {
      console.warn("GitHub API access failed, using cached documentation list.", error.message);
      remoteFiles = Object.keys(cache).map(path => ({
        path,
        sha: cache[path].sha,
        download_url: `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/main/${path}`
      }));
    } else {
      throw error;
    }
  }

  const docs = [];
  const newCache = {};

  for (const file of remoteFiles) {
    const slug = slugFromPath(file.path);
    
    let content;
    if (cache[file.path] && cache[file.path].sha === file.sha) {
      content = cache[file.path].content;
      newCache[file.path] = cache[file.path];
    } else {
      try {
        console.log(`Fetching ${file.path}...`);
        content = await fetchText(file.download_url);
        newCache[file.path] = { sha: file.sha, content };
      } catch (error) {
        if (cache[file.path]) {
          console.warn(`Failed to fetch ${file.path}, using cache.`, error.message);
          content = cache[file.path].content;
          newCache[file.path] = cache[file.path];
        } else {
          throw error;
        }
      }
    }

    const htmlData = await buildHtml(file.path, content);

    docs.push({
      slug,
      title: htmlData.title,
      description: htmlData.description,
      html: htmlData.html,
      content: htmlData.content,
      sourcePath: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/blob/main/${file.path}`
    });
  }

  const validSlugs = new Set(docs.map((doc) => doc.slug));
  
  // Find README.md for sidebar
  const readmeFile = remoteFiles.find(f => f.path === `${DOCS_PATH}/README.md`);
  let readmeContent = "";
  if (readmeFile && newCache[readmeFile.path]) {
    readmeContent = newCache[readmeFile.path].content;
  } else {
    console.warn("No README.md found in docs/ folder for sidebar generation.");
  }

  const sidebar = parseSidebar(readmeContent, validSlugs);

  const searchIndex = docs.map((doc) => ({
    slug: doc.slug,
    title: doc.title,
    snippet: (doc.description || "").slice(0, 140),
    content: (doc.content || "").toLowerCase()
  }));

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, "docs.json"), JSON.stringify(docs, null, 2));
  await fs.writeFile(path.join(outputDir, "sidebar.json"), JSON.stringify(sidebar, null, 2));
  await fs.writeFile(path.join(outputDir, "search-index.json"), JSON.stringify(searchIndex, null, 2));

  // Save cache
  await fs.mkdir(path.dirname(cachePath), { recursive: true });
  await fs.writeFile(cachePath, JSON.stringify(newCache, null, 2));

  console.log(`Generated ${docs.length} docs pages.`);
};

main().catch((error) => {
  console.error("Docs generation failed:", error);
  process.exit(1);
});
