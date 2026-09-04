/**
 * Client-side fetch + populate for /blog/post?slug=... -- the same
 * loadProductPage()/populateProductPage() pattern script.js already uses
 * for /product?item=..., kept in its own file since article-template.html
 * is the only page that needs it (product-page population stays in
 * script.js because every page that lists products reads from it too).
 *
 * api/product-meta.js already server-renders this page's <title>/meta/
 * JSON-LD tags for crawlers before this ever runs; this is what fills in
 * the actual visible content for a real visitor's browser.
 */
function escArticleHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function loadArticlePage() {
  const titleEl = document.getElementById("articleTitle");
  if (!titleEl) return;

  const reveal = () => document.querySelector(".article-page")?.classList.remove("apg-loading");
  const params = new URLSearchParams(window.location.search);
  const slug = (params.get("slug") || "").trim();

  if (!slug) {
    document.querySelector(".article-body-wrap").innerHTML = `<div class="article-not-found"><h1>Article not found</h1><p><a href="/blog">Back to the blog</a></p></div>`;
    reveal();
    return;
  }

  const { data: article, error } = await window.sb
    .from("articles")
    .select("*")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();

  if (error || !article) {
    document.querySelector(".article-body-wrap").innerHTML = `<div class="article-not-found"><h1>Article not found</h1><p><a href="/blog">Back to the blog</a></p></div>`;
    reveal();
    return;
  }

  document.title = (article.meta_title || article.title) + " | Room Ready Supply";
  titleEl.textContent = article.title;
  document.getElementById("breadcrumbArticleTitle").textContent = article.title;

  const dateEl = document.getElementById("articleMeta");
  if (dateEl && article.published_at) {
    dateEl.textContent = new Date(article.published_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  }

  const coverEl = document.getElementById("articleCoverImg");
  if (coverEl && article.cover_image_url) {
    coverEl.src = article.cover_image_url;
    coverEl.alt = article.title;
  }

  const excerptEl = document.getElementById("articleExcerpt");
  if (excerptEl && article.excerpt) {
    excerptEl.textContent = article.excerpt;
    excerptEl.style.display = "";
  }

  const bodyEl = document.getElementById("articleBody");
  if (bodyEl) bodyEl.innerHTML = article.body_html || "";

  reveal();
  loadRelatedArticles(article.id);
}

// SEO Roadmap Day 19: related-posts module. Simple "every other
// published article" rather than a topic-similarity match -- there are
// only 3 articles as of Day 18/19, so any published article is
// relevant; this scales fine as more publish (Day 21+) since it's
// capped at 3 and just excludes the one being read.
async function loadRelatedArticles(currentId) {
  const wrap = document.getElementById("articleRelated");
  const grid = document.getElementById("articleRelatedGrid");
  if (!wrap || !grid) return;

  const { data: related, error } = await window.sb
    .from("articles")
    .select("slug, title, excerpt")
    .eq("status", "published")
    .neq("id", currentId)
    .order("published_at", { ascending: false })
    .limit(3);

  if (error || !related || !related.length) return;

  grid.innerHTML = related.map(a => `
    <a class="article-related-card" href="/blog/post?slug=${encodeURIComponent(a.slug)}">
      <p class="rel-title">${escArticleHtml(a.title)}</p>
      ${a.excerpt ? `<p class="rel-excerpt">${escArticleHtml(a.excerpt)}</p>` : ""}
    </a>`).join("");
  wrap.style.display = "";
}

document.addEventListener("DOMContentLoaded", () => {
  // supabase.js's window.sb is created synchronously on load, but this
  // file loads after it in article-template.html's script order, so no
  // extra wait is needed here -- matching how script.js's own
  // DOMContentLoaded-driven page loaders assume window.sb already exists.
  loadArticlePage();
});
