/**
 * Populates /blog's article grid. Client-side only -- unlike a single
 * product/article page, the index itself carries no per-article SEO tags
 * that need to exist before a crawler's first fetch (its own <title>/
 * description are already static in blog.html), so this doesn't need the
 * api/product-meta.js server-render treatment the way /blog/post does.
 */
function escBlogHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function loadBlogIndex() {
  const grid = document.getElementById("blogGrid");
  if (!grid) return;

  const { data: articles, error } = await window.sb
    .from("articles")
    .select("slug, title, excerpt, cover_image_url, published_at")
    .eq("status", "published")
    .order("published_at", { ascending: false });

  if (error) {
    grid.innerHTML = `<div class="blog-empty">Couldn't load articles right now.</div>`;
    return;
  }
  if (!articles || !articles.length) {
    grid.innerHTML = `<div class="blog-empty">New articles are on the way &mdash; check back soon.</div>`;
    return;
  }

  grid.innerHTML = articles.map(a => {
    const dateStr = a.published_at
      ? new Date(a.published_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
      : "";
    return `
    <a class="blog-card" href="/blog/post?slug=${encodeURIComponent(a.slug)}">
      ${a.cover_image_url ? `<img class="blog-card-img" src="${escBlogHtml(a.cover_image_url)}" alt="" loading="lazy">` : ""}
      <div class="blog-card-body">
        ${dateStr ? `<p class="blog-card-date">${escBlogHtml(dateStr)}</p>` : ""}
        <h2 class="blog-card-title">${escBlogHtml(a.title)}</h2>
        ${a.excerpt ? `<p class="blog-card-excerpt">${escBlogHtml(a.excerpt)}</p>` : ""}
        <span class="blog-card-read">Read more &rarr;</span>
      </div>
    </a>`;
  }).join("");
}

document.addEventListener("DOMContentLoaded", loadBlogIndex);
