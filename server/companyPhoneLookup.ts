import https from "node:https";
import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

export interface PhoneEvidence { phone: string; sourceUrl: string; checkedAt: Date }
export interface PhoneLookup { status: "verified" | "not_found" | "unavailable"; evidence?: PhoneEvidence }

const blocked = new BlockList();
for (const [ip, bits] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24],
  ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15],
  ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) blocked.addSubnet(ip, bits, "ipv4");
const globalV6 = new BlockList();
globalV6.addSubnet("2000::", 3, "ipv6");
for (const [ip, bits] of [["2001:db8::", 32], ["2001::", 32], ["2002::", 16]] as const) {
  blocked.addSubnet(ip, bits, "ipv6");
}
export function isPublicAddress(ip: string): boolean {
  const version = isIP(ip);
  return version === 4 ? !blocked.check(ip, "ipv4") :
    version === 6 && globalV6.check(ip, "ipv6") && !blocked.check(ip, "ipv6");
}
export function sourceUrl(value: string, domain?: string): URL {
  const url = new URL(value);
  if (url.protocol !== "https:" || (url.port && url.port !== "443") ||
    url.username || url.password || url.search || url.hash || isIP(url.hostname.replace(/[\[\]]/g, "")) ||
    !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(url.hostname) ||
    /(?:^|\.)(?:localhost|local|internal|onion)$/i.test(url.hostname)) {
    throw new Error("Use a public HTTPS company page without credentials, query strings, or fragments.");
  }
  if (domain && url.hostname !== domain && !url.hostname.endsWith(`.${domain}`)) {
    throw new Error("The page must stay on the confirmed company domain.");
  }
  return url;
}
export function normalizeCompanyName(value: string): string {
  return value.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
}
export function normalizeCompanyPhone(value: string): string | null {
  const base = value.split(/[;#]/, 1)[0].trim();
  const digits = base.replace(/\D/g, "");
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (base.startsWith("+") && !digits.startsWith("1") && /^[2-9]\d{7,14}$/.test(digits)) return `+${digits}`;
  return /^[2-9]\d{2}[2-9]\d{6}$/.test(national) ? `+1${national}` : null;
}
const decode = (text: string) => text.replace(/&#(?:x([a-f\d]+)|(\d+));/gi, (_, hex, decimal) => {
  const n = parseInt(hex || decimal, hex ? 16 : 10);
  return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "";
}).replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"');
const plain = (html: string) => decode(html.replace(/<!--[\s\S]*?-->|<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");

/** Only actual telephone fields, tel links and visible published numbers are evidence. */
export function extractPublishedPhone(html: string, accountHint = ""): string | null {
  const candidates: Array<{ phone: string; score: number }> = [];
  const department = /\b(?:auto|vehicle|car|lease)\b/i.test(accountHint) ? /\b(?:auto|vehicle|car|lease)\b/i :
    /\b(?:mortgage|home loan)\b/i.test(accountHint) ? /\b(?:mortgage|home loan)\b/i :
    /\b(?:credit card)\b/i.test(accountHint) ? /\b(?:credit card)\b/i :
    /\b(?:invest|investment|brokerage|ira|securities|retirement)\b/i.test(accountHint) ? /\b(?:invest|investment|brokerage|securities)\b/i :
    /\b(?:bank|checking|chequing|savings|deposit)\b/i.test(accountHint) ? /\b(?:bank|checking|savings|deposit)\b/i : null;
  const add = (value: string, context: string, bonus = 0, focus = context) => {
    const phone = normalizeCompanyPhone(decode(value));
    if (!phone || /\b(?:fax|tty|tdd|fraud|stolen|press|investor|media|recruiting|privacy|preferences|marketing|advertising)\b/i.test(focus)) return;
    const score = bonus + (department?.test(context.slice(-80)) ? 50 : 0) +
      (/\b(?:bereave|bereavement|deceased|estate)\b/i.test(context) ? 60 : 0) +
      (/\b(?:customer|service|support|contact|call|general)\b/i.test(context) ? 20 : 0);
    candidates.push({ phone, score });
  };
  for (const match of Array.from(html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi))) {
    try {
      let visited = 0;
      const visit = (item: any, depth: number) => {
        if (!item || typeof item !== "object" || depth > 7 || ++visited > 150) return;
        if (typeof item.telephone === "string") add(item.telephone, String(item.contactType || item.name || ""), 15);
        for (const child of Object.values(item)) {
          if (Array.isArray(child)) child.slice(0, 50).forEach((entry) => visit(entry, depth + 1));
          else visit(child, depth + 1);
        }
      };
      visit(JSON.parse(match[1]), 0);
    } catch { /* Invalid structured markup is not evidence. */ }
  }
  const visibleHtml = html.replace(/<!--[\s\S]*?-->|<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>/gi, " ");
  for (const match of Array.from(visibleHtml.matchAll(/<a\b[^>]*href=["']tel:([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi))) {
    const before = plain(visibleHtml.slice(Math.max(0, match.index! - 1600), match.index!)).slice(-140);
    const label = plain(match[2]);
    add(match[1], `${before} ${label}`, 10, `${before.slice(-45)} ${label}`);
  }
  const text = plain(visibleHtml);
  for (const match of Array.from(text.matchAll(/(?:\+\d{1,3}[\s.-]*)?(?:\(?\d{3}\)?[\s.-]*)\d{3}[\s.-]*\d{4}\b/g))) {
    const before = text.slice(Math.max(0, match.index! - 140), match.index!);
    add(match[0], before, 0, before.slice(-45));
  }
  return candidates.sort((a, b) => b.score - a.score)[0]?.phone || null;
}

let active = 0;
const waiting: Array<() => void> = [];
async function networkSlot<T>(work: () => Promise<T>): Promise<T> {
  if (active < 4) active++;
  else await new Promise<void>((resolve, reject) => {
    const ready = () => { clearTimeout(timer); resolve(); };
    const timer = setTimeout(() => {
      const index = waiting.indexOf(ready);
      if (index >= 0) waiting.splice(index, 1);
      reject(new Error("Phone lookup is busy."));
    }, 20000);
    if (waiting.length >= 40) { clearTimeout(timer); reject(new Error("Phone lookup is busy.")); }
    else waiting.push(ready);
  });
  try { return await work(); }
  finally { const next = waiting.shift(); if (next) next(); else active--; }
}

export async function fetchCompanyPage(url: URL, domain: string, redirects = 0): Promise<{ html: string; url: string }> {
  sourceUrl(url.href, domain);
  const addresses = await Promise.race([
    lookup(url.hostname, { all: true }),
    new Promise<never>((_, reject) => { const timer = setTimeout(() => reject(new Error("DNS timeout")), 4000); timer.unref(); }),
  ]);
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) throw new Error("Not a public company website.");
  const chosen = addresses[0];
  const page = await networkSlot(() => new Promise<{ html: string; redirect?: string }>((resolve, reject) => {
    // DNS answers are validated AND pinned to this connection; redirects are revalidated.
    const request = https.get(url, {
      family: chosen.family,
      lookup: (_host, _options, callback) => callback(null, chosen.address, chosen.family),
      headers: { "User-Agent": "StepsAfterLife-CompanyContact/1.0", Accept: "text/html", "Accept-Encoding": "identity" },
    }, (response) => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode || 0) && response.headers.location) {
        response.destroy(); resolve({ html: "", redirect: response.headers.location }); return;
      }
      if (response.statusCode !== 200 || !/text\/html|application\/xhtml\+xml/i.test(String(response.headers["content-type"]))) {
        response.destroy(); reject(new Error("Company page was not available.")); return;
      }
      const chunks: Buffer[] = [];
      let bytes = 0;
      response.on("error", reject);
      response.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > 768 * 1024) { response.destroy(); reject(new Error("Company page is too large.")); return; }
        chunks.push(chunk);
      });
      response.on("end", () => resolve({ html: Buffer.concat(chunks).toString("utf8") }));
    });
    const deadline = setTimeout(() => request.destroy(new Error("Company page timed out.")), 8000);
    request.on("close", () => clearTimeout(deadline));
    request.on("error", reject);
  }));
  if (page.redirect) {
    if (redirects >= 3) throw new Error("Too many company page redirects.");
    return fetchCompanyPage(sourceUrl(new URL(page.redirect, url).href, domain), domain, redirects + 1);
  }
  return { html: page.html, url: url.href };
}

export function contactPages(html: string, base: string, domain: string): URL[] {
  const urls = new Map<string, URL>();
  for (const match of Array.from(html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi))) {
    if (!/contact|customer.service|bereave|deceased|estate|support/i.test(match[1] + plain(match[2]))) continue;
    try {
      const url = new URL(decode(match[1]), base);
      url.search = ""; url.hash = "";
      sourceUrl(url.href, domain);
      if (url.href !== base && !/\.(?:pdf|jpg|png|zip)$/i.test(url.pathname)) urls.set(url.href, url);
    } catch { /* Third-party, private and non-HTTPS links are never followed. */ }
  }
  return Array.from(urls.values()).slice(0, 2);
}
const cached = new Map<string, { result: PhoneLookup; until: number }>();
const pending = new Map<string, Promise<PhoneLookup>>();
export async function discoverCompanyPhone(
  website: string, domain: string, force = false, fetchPage = fetchCompanyPage, accountHint = "",
): Promise<PhoneLookup> {
  const first = sourceUrl(website, domain);
  const key = `${first.href}|${normalizeCompanyName(accountHint)}`;
  if (!force && (cached.get(key)?.until || 0) > Date.now()) return cached.get(key)!.result;
  if (pending.has(key)) return pending.get(key)!;
  const work = (async (): Promise<PhoneLookup> => {
    let result: PhoneLookup = { status: "not_found" };
    try {
      const home = await fetchPage(first, domain);
      sourceUrl(home.url, domain);
      let phone = extractPublishedPhone(home.html, accountHint);
      let pageUrl = home.url;
      if (!phone) for (const link of contactPages(home.html, home.url, domain)) {
        try {
          const page = await fetchPage(link, domain);
          sourceUrl(page.url, domain);
          phone = extractPublishedPhone(page.html, accountHint);
          if (phone) { pageUrl = page.url; break; }
        } catch { /* One inaccessible contact link does not invent a number. */ }
      }
      if (phone) result = { status: "verified", evidence: { phone, sourceUrl: pageUrl, checkedAt: new Date() } };
    } catch { result = { status: "unavailable" }; }
    if (cached.size >= 256) cached.delete(cached.keys().next().value!);
    cached.set(key, { result, until: Date.now() + (result.evidence ? 86400000 : 300000) });
    return result;
  })();
  pending.set(key, work);
  try { return await work; } finally { pending.delete(key); }
}
