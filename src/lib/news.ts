export interface NewsItem { title: string; link: string; source: string; date: string }

const decode = (s: string) =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
const tag = (block: string, name: string) => {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? decode(m[1]) : "";
};

/** Lê o RSS do Google Notícias. Só devolve itens com título, link e data válidos. */
export function parseNewsRss(xml: string, limit = 5): NewsItem[] {
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  const out: NewsItem[] = [];
  for (const it of items) {
    const title = tag(it, "title"), link = tag(it, "link"), pub = tag(it, "pubDate"), source = tag(it, "source");
    const d = new Date(pub);
    if (!title || !link.startsWith("http") || Number.isNaN(d.getTime())) continue;
    out.push({ title, link, source: source || "fonte não informada", date: d.toISOString() });
    if (out.length >= limit) break;
  }
  return out;
}

export async function fetchPillarNews(keywords: string[], lang: "pt" | "en", fetchFn: typeof fetch = fetch): Promise<NewsItem[]> {
  const q = encodeURIComponent(keywords.slice(0, 4).map((k) => `"${k}"`).join(" OR ") + " when:7d");
  const loc = lang === "pt" ? "hl=pt-BR&gl=BR&ceid=BR:pt-419" : "hl=en-US&gl=US&ceid=US:en";
  const res = await fetchFn(`https://news.google.com/rss/search?q=${q}&${loc}`, { headers: { "user-agent": "LinkedinStyle/1.0" } });
  if (!res.ok) throw new Error(`Google Notícias respondeu ${res.status}`);
  return parseNewsRss(await res.text());
}
