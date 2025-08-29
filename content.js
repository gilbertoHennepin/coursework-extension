console.log("DUE-SCRAPER: content.js loaded on", location.href);

const DEBUG = true;
function debugLog(...args) { if (DEBUG) console.log("DUE-SCRAPER:", ...args); }

function monthNameToNum(m) {
  const map = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,sept:8,oct:9,nov:10,dec:11 };
  return map[m.toLowerCase().slice(0,3)];
}

function makeSafeDate(str) {
  if (!str) return null;
  let d = new Date(str);
  if (!isNaN(d)) return d;
  const now = new Date();
  const year = now.getFullYear();
  d = new Date(`${str} ${year}`);
  if (!isNaN(d)) {
    if ((now - d) / (1000*60*60*24) > 120) d.setFullYear(year + 1);
    return d;
  }
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
  // ISO fallback
  const iso = str.match(/\d{4}-\d{2}-\d{2}/);
  if (iso) {
    const dd = new Date(iso[0]);
    if (!isNaN(dd)) return dd;
  }
  return null;
}

// new: returns {dateISO, type} or null
function extractDateWithType(text) {
  if (!text) return null;
  // 1) explicit "Due ..." (mark as due)
  let m = text.match(/Due(?: on)?\s*([A-Za-z0-9,:\/\-\s]+?\d{4}(?:\s*\d{1,2}:\d{2}\s*(?:AM|PM)?)?)/i);
  if (m) {
    const d = makeSafeDate(m[1].trim());
    if (d) return { dateISO: d.toISOString(), type: "due" };
  }

  // 2) "Available until ..." (mark as available-until)
  m = text.match(/Available until\s*([A-Za-z0-9,:\/\-\s]+?\d{4}(?:\s*\d{1,2}:\d{2}\s*(?:AM|PM)?)?)/i);
  if (m) {
    const d = makeSafeDate(m[1].trim());
    if (d) return { dateISO: d.toISOString(), type: "available-until" };
  }

  // 3) range like "Aug 25 - Sep 1, 2025" -> prefer end of range, treat as available-until
  m = text.match(/([A-Za-z]{3,9}\s*\d{1,2}(?:[,\s]*\d{4})?)\s*[-–]\s*([A-Za-z]{3,9}\s*\d{1,2}(?:[,\s]*\d{4})?)/i);
  if (m) {
    const end = makeSafeDate(m[2].trim());
    if (end) return { dateISO: end.toISOString(), type: "available-until" };
  }

  // 4) fallback: pick the last month/day mention
  const singleMatches = Array.from(text.matchAll(/\b([A-Za-z]{3,9}\s*\d{1,2}(?:[,\s]*\d{4})?)\b/ig)).map(x=>x[1]);
  if (singleMatches.length) {
    const candidate = singleMatches[singleMatches.length-1];
    const d = makeSafeDate(candidate);
    if (d) return { dateISO: d.toISOString(), type: "available-until" };
  }

  // 5) ISO date
  m = text.match(/\d{4}-\d{2}-\d{2}/);
  if (m) {
    const d = new Date(m[0]);
    if (!isNaN(d)) return { dateISO: d.toISOString(), type: "available-until" };
  }

  return null;
}

function findDateInNode(node) {
  if (!node) return null;
  const txt = node.innerText || "";
  let res = extractDateWithType(txt);
  if (res) { debugLog("matched date in node text", res); return res; }

  const smallCandidates = node.querySelectorAll ? node.querySelectorAll("time, span, small, div, p") : [];
  for (const el of smallCandidates) {
    const t = (el.innerText || "").trim();
    if (!t) continue;
    const r = extractDateWithType(t);
    if (r) { debugLog("matched date in child element", r, "text:", t); return r; }
  }
  return null;
}

function collectCandidates(root = document) {
  const selectors = [
    "tr", "li",
    ".d2l-list-item", ".d2l-listview", ".d2l-card",
    ".assignment", ".d2l-activityfeed-item", ".d2l-activity",
    ".d2l-ListItem", ".d2l-typography", ".d2l-tile", ".d2l-entity-row"
  ];
  let list = [];
  try { list = Array.from(root.querySelectorAll(selectors.join(","))); } catch (e) { list = []; }

  if (root instanceof Element || root instanceof Document) {
    const hosts = Array.from((root instanceof Document ? root.documentElement : root).querySelectorAll("*"));
    for (const host of hosts) if (host.shadowRoot) list.push(...collectCandidates(host.shadowRoot));
  }

  const frames = (root instanceof Document ? root : document).querySelectorAll ? Array.from((root instanceof Document ? root : document).querySelectorAll("iframe")) : [];
  for (const f of frames) {
    try { if (f.contentDocument) list.push(...collectCandidates(f.contentDocument)); } catch (e) { debugLog("iframe cross-origin, skipping", f.src); }
  }

  return list;
}

function extractTitleFromNode(node) {
  if (!node) return "";
  // 1) Prefer anchors/headings inside node
  try {
    const primary = node.querySelector && node.querySelector("a, h1, h2, h3, h4, strong");
    if (primary && primary.innerText && primary.innerText.trim().length > 2) return primary.innerText.trim();

    // 2) Walk upward a few levels to find a better title anchor/heading
    let p = node;
    let depth = 0;
    while (p && p !== document.body && depth < 8) {
      // look for a link with a meaningful text
      const link = p.querySelector && Array.from(p.querySelectorAll("a")).find(a => a.innerText && a.innerText.trim().length > 2);
      if (link) return link.innerText.trim();

      // look for headings
      const heading = p.querySelector && p.querySelector("h1,h2,h3,h4,strong");
      if (heading && heading.innerText && heading.innerText.trim().length > 2) return heading.innerText.trim();

      // fallback: check direct text of the ancestor (avoid short list markers like "1.")
      const txt = (p.innerText || "").split("\n").map(s => s.trim()).find(Boolean);
      if (txt && txt.length > 3 && !/^\d+[\.\)]?$/.test(txt)) return txt;

      p = p.parentElement;
      depth++;
    }

    // 3) final fallback: use node text but prefer lines that look like titles (contain letters and >3 chars)
    const candidate = (node.innerText || "").split("\n").map(s => s.trim()).find(s => s.length > 3 && /[A-Za-z]/.test(s));
    return candidate || "";
  } catch (e) {
    return (node.innerText || "").split("\n").map(s => s.trim()).find(s => s.length > 3 && /[A-Za-z]/.test(s)) || "";
  }
}

function extractAssignmentInfo(node) {
  const text = node.innerText || '';
  
  // Match "Due on <date>" pattern
  const dateMatch = text.match(/Due on ([A-Za-z]+ \d{1,2}, \d{4} \d{1,2}:\d{2} [AP]M)/);
  if (!dateMatch) return null;

  // Get assignment title - first non-empty line that's not a date or score
  const lines = text.split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.includes('Due on') && !l.match(/^\d+\s*\/\s*\d+$/));
  
  const title = lines[0];
  if (!title) return null;

  // Get score if available
  const scoreMatch = text.match(/(\d+)\s*\/\s*(\d+)/);
  const score = scoreMatch ? `${scoreMatch[1]}/${scoreMatch[2]}` : null;

  return {
    title: title.replace(/â€"/g, '-').trim(),
    date: new Date(dateMatch[1]).toISOString(),
    type: 'due',
    score
  };
}

function scrapeDueDates() {
  const assignments = [];
  
  // Target assignment rows
  const containers = document.querySelectorAll('tr, .d2l-table-row');
  
  containers.forEach(container => {
    const info = extractAssignmentInfo(container);
    if (info) assignments.push(info);
  });

  if (assignments.length) {
    chrome.storage.sync.get("dueDates", (data) => {
      let existing = data.dueDates || [];
      
      assignments.forEach(item => {
        // Update or add new assignments
        const index = existing.findIndex(e => e.title === item.title);
        if (index >= 0) {
          existing[index] = item; // Update existing
        } else {
          existing.push(item); // Add new
        }
      });

      // Sort by date
      existing.sort((a, b) => new Date(a.date) - new Date(b.date));
      
      chrome.storage.sync.set({ dueDates: existing });
    });
  }
}
