console.log("DUE-SCRAPER: content.js loaded on", location.href);

const DEBUG = true;
function debugLog(...args) { if (DEBUG) console.log("DUE-SCRAPER:", ...args); }

function monthNameToNum(m) {
  const map = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,sept:8,oct:9,nov:10,dec:11 };
  return map[m.toLowerCase().slice(0,3)];
}

function makeSafeDate(str) {
  if (!str) return null;
  // try direct parse
  let d = new Date(str);
  if (!isNaN(d)) return d;
  // add current year if missing
  const now = new Date();
  const year = now.getFullYear();
  const withYear = `${str} ${year}`;
  d = new Date(withYear);
  if (!isNaN(d)) {
    // if result is far in the past assume next year
    const daysDiff = (now - d) / (1000*60*60*24);
    if (daysDiff > 120) d.setFullYear(year + 1);
    return d;
  }
  // try parsing formats like "Aug 25" or "Sep 1"
  const m = str.match(/([A-Za-z]{3,9})\s*(\d{1,2})/);
  if (m) {
    const mn = monthNameToNum(m[1]);
    const day = parseInt(m[2], 10);
    if (!isNaN(mn) && !isNaN(day)) {
      d = new Date(year, mn, day);
      if ((new Date()) - d > (120*24*60*60*1000)) d.setFullYear(year + 1);
      return d;
    }
  }
  return null;
}

// improved extractDate: handles "Due ...", ranges like "Aug 25 - Sep 1", and yearless dates
function extractDate(text) {
  if (!text) return null;

  // 1) explicit "Due ..." with a year/time
  let m = text.match(/Due(?: on)?\s*([A-Za-z0-9,:\/\-\s]+?\d{4}(?:\s*\d{1,2}:\d{2}\s*(?:AM|PM)?)?)/i);
  if (m) {
    const d = makeSafeDate(m[1].trim());
    if (d) return d.toString();
  }

  // 2) range like "Aug 25 - Sep 1, 2025" or "Aug 25 - Sep 1"
  m = text.match(/([A-Za-z]{3,9}\s*\d{1,2}(?:[,\s]*\d{4})?)\s*[-–]\s*([A-Za-z]{3,9}\s*\d{1,2}(?:[,\s]*\d{4})?)/i);
  if (m) {
    // prefer the end date of the range
    const end = m[2].trim();
    const d = makeSafeDate(end);
    if (d) return d.toString();
  }

  // 3) single month/day with optional year (pick the last reasonable date in the text)
  const singleMatches = Array.from(text.matchAll(/\b([A-Za-z]{3,9}\s*\d{1,2}(?:[,\s]*\d{4})?)\b/ig)).map(x=>x[1]);
  if (singleMatches.length) {
    const candidate = singleMatches[singleMatches.length-1];
    const d = makeSafeDate(candidate);
    if (d) return d.toString();
  }

  // 4) ISO date
  m = text.match(/\d{4}-\d{2}-\d{2}/);
  if (m) {
    const d = new Date(m[0]);
    if (!isNaN(d)) return d.toString();
  }

  return null;
}

// scan node's own text and children for a date-looking substring
function findDateInNode(node) {
  if (!node) return null;
  // prefer any text that contains "Due"
  const txt = node.innerText || "";
  let dt = extractDate(txt);
  if (dt) {
    debugLog("matched date in node text", dt);
    return dt;
  }

  // search likely child elements for short date text (time, small, span, div)
  const smallCandidates = node.querySelectorAll ? node.querySelectorAll("time, span, small, div, p") : [];
  for (const el of smallCandidates) {
    const t = (el.innerText || "").trim();
    if (!t) continue;
    const d = extractDate(t);
    if (d) {
      debugLog("matched date in child element", d, "text:", t);
      return d;
    }
  }
  return null;
}

// lightweight candidate collector (keeps existing shadow/iframe recursion if needed)
function collectCandidates(root = document) {
  const selectors = [
    "tr", "li",
    ".d2l-list-item", ".d2l-listview", ".d2l-card",
    ".assignment", ".d2l-activityfeed-item", ".d2l-activity",
    ".d2l-ListItem", ".d2l-typography", ".d2l-tile", ".d2l-entity-row"
  ];
  let list = [];
  try { list = Array.from(root.querySelectorAll(selectors.join(","))); } catch (e) { list = []; }

  // shadow roots
  if (root instanceof Element || root instanceof Document) {
    const hosts = Array.from((root instanceof Document ? root.documentElement : root).querySelectorAll("*"));
    for (const host of hosts) if (host.shadowRoot) list.push(...collectCandidates(host.shadowRoot));
  }

  // same-origin iframes
  const frames = (root instanceof Document ? root : document).querySelectorAll ? Array.from((root instanceof Document ? root : document).querySelectorAll("iframe")) : [];
  for (const f of frames) {
    try { if (f.contentDocument) list.push(...collectCandidates(f.contentDocument)); } catch (e) { debugLog("iframe cross-origin, skipping", f.src); }
  }

  return list;
}

function scrapeDueDates() {
  debugLog("scrapeDueDates start");
  const seen = new Set();
  const dueItems = [];
  const candidates = collectCandidates(document);
  debugLog("candidates length", candidates.length);
  if (candidates.length === 0) candidates.push(document.body);

  candidates.forEach(node => {
    const txt = node.innerText || "";
    if (!txt) return;
    // quick filter: must include 'Due' or month names
    if (!/Due\b/i.test(txt) && !/(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\b/i.test(txt)) return;

    // find a title (existing logic)
    let title = "";
    try {
      const a = node.querySelector("a, h1, h2, h3, h4, strong");
      if (a && a.innerText.trim()) title = a.innerText.trim();
      else {
        let p = node;
        while (p && p !== document.body) {
          const link = p.querySelector("a, h1, h2, h3, h4, strong");
          if (link && link.innerText.trim()) { title = link.innerText.trim(); break; }
          p = p.parentElement;
        }
      }
      if (!title) title = (node.innerText || "").split("\n").map(s=>s.trim()).find(Boolean) || "";
    } catch (e) { title = (node.innerText || "").split("\n").map(s=>s.trim()).find(Boolean) || ""; }

    const date = findDateInNode(node);
    if (!title || !date) return;

    const key = `${title}||${date}`;
    if (seen.has(key)) return;
    seen.add(key);
    dueItems.push({ title, date });
  });

  debugLog("found dueItems", dueItems);
  if (dueItems.length > 0) {
    chrome.storage.sync.get("dueDates", (data) => {
      const existing = data.dueDates || [];
      dueItems.forEach(item => { if (!existing.some(e=>e.title===item.title && e.date===item.date)) existing.push(item); });
      chrome.storage.sync.set({ dueDates: existing }, () => debugLog("Saved dueDates:", existing));
    });
  }
}

function startScraper() {
  debugLog("startScraper");
  scrapeDueDates();
  const observer = new MutationObserver(() => {
    if (observer._timeout) clearTimeout(observer._timeout);
    observer._timeout = setTimeout(scrapeDueDates, 300);
  });
  observer.observe(document, { childList: true, subtree: true });
}

if (document.readyState === "complete" || document.readyState === "interactive") startScraper();
else window.addEventListener("DOMContentLoaded", startScraper, { once: true });
