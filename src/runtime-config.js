import { applyRuntimeConfig } from "./data.js?v=1.5.6";

const CONFIG_URL = "https://uma-api-staging.r8asknazotoki.workers.dev/api/public/runtime-config";

function renderPublicNotices(runtime) {
  const root = document.querySelector("#serviceNotice");
  if (!root) return;
  root.replaceChildren();
  if (runtime.maintenance?.enabled) {
    const maintenance = document.createElement("section");
    maintenance.className = "service-message maintenance";
    const title = document.createElement("strong");
    title.textContent = "メンテナンスのお知らせ";
    const body = document.createElement("p");
    body.textContent = runtime.maintenance.message || "現在メンテナンス中です。ゲームはそのまま遊べます。";
    maintenance.append(title, body);
    root.append(maintenance);
  }
  const announcements = Array.isArray(runtime.announcements) ? runtime.announcements : [];
  if (announcements.length) {
    const details = document.createElement("details");
    details.className = "service-message announcements";
    const summary = document.createElement("summary");
    summary.textContent = `運営からのお知らせ（${announcements.length}件）`;
    const list = document.createElement("div");
    list.className = "service-announcement-list";
    for (const announcement of announcements) {
      const article = document.createElement("article");
      const title = document.createElement("strong");
      const body = document.createElement("p");
      title.textContent = String(announcement.title ?? "お知らせ");
      body.textContent = String(announcement.body ?? "");
      article.append(title, body);
      list.append(article);
    }
    details.append(summary, list);
    root.append(details);
  }
  root.hidden = root.childElementCount === 0;
}

export async function loadRuntimeConfig() {
  try {
    const response = await fetch(CONFIG_URL, { credentials: "omit", cache: "default", signal: AbortSignal.timeout(1800) });
    if (!response.ok) return;
    const runtime = await response.json();
    applyRuntimeConfig(runtime.game);
    renderPublicNotices(runtime);
  } catch {
    // Keep local default gameplay usable when the optional service is unreachable.
  }
}
