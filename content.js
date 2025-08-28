console.log("DUE-SCRAPER: content.js loaded on", location.href);

const DEBUG = true;

function debugLog(...args) {
  if (DEBUG) console.log("DUE-SCRAPER:", ...args);
}

// recurse into a node, its shadow root and same-origin iframes
function collectCandidates(root = document) {
  const list = [];
  try {
    // typical candidates inside this root
    list.push(...Array.from(root.querySelectorAll("tr, li, .d2l-list-item, .d2l-listview, .d2l-card, .assignment, .d2l-activityfeed-item, .d2l-activity, .d2l-ListItem")));
  } catch (e) {
    // querySelectorAll can fail on some nodes; ignore
  }

  // if root is a Document or Element, check for shadow elements
  if (root instanceof Element || root instanceof Document) {
    const shadowHosts = Array.from((root instanceof Document ? root.documentElement : root).querySelectorAll("*"));
    for (const host of shadowHosts) {
      if (host.shadowRoot) {
        list.push(...collectCandidates(host.shadowRoot));
      }
    }
  }

  // same-origin iframes
  const iframes = (root instanceof Document ? root : (root.ownerDocument || document)).querySelectorAll ? Array.from((root instanceof Document ? root : document).querySelectorAll("iframe")) : [];
  for (const frame of iframes) {
    try {
      if (frame.contentDocument) {
        list.push(...collectCandidates(frame.contentDocument));
      }
    } catch (e) {
      // cross-origin iframe - cannot access
      debugLog("iframe cross-origin, skipping", frame.src);
    }
  }

  return list;
}

function scrapeDueDates() {
  debugLog("scrapeDueDates start");
  const seen = new Set();
  let dueItems = [];

  function extractTitle(node) {
    if (!node) return "";
    const a = node.querySelector("a, h1, h2, h3, h4, strong");
    if (a && a.innerText.trim()) return a.innerText.trim();
    let p = node;
    while (p && p !== document.body) {
      const link = p.querySelector("a, h1, h2, h3, h4, strong");
      if (link && link.innerText.trim()) return link.innerText.trim();
      p = p.parentElement;
    }
    const txt = node.innerText || "";
    return txt.split("\n").map(s => s.trim()).find(Boolean) || "";
  }

  function extractDate(text) {
    if (!text) return null;
    let m = text.match(/Due(?: on)?\s*([A-Za-z0-9,:\/\-\s]+?\d{4}(?:\s*\d{1,2}:\d{2}\s*(?:AM|PM)?)?)/i);
    if (m) return m[1].trim();
    m = text.match(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*[ .\-\/]*\d{1,2}[, ]*\s*\d{4}\b/i);
    if (m) return m[0].trim();
    m = text.match(/\d{4}-\d{2}-\d{2}/);
    if (m) return m[0];
    return null;
  }

  // collect candidates from document + shadow roots + accessible iframes
  const candidates = collectCandidates(document);
  debugLog("candidates length", candidates.length);
  if (candidates.length === 0) {
    // as a fallback scan body text
    candidates.push(document.body);
  }

  candidates.forEach(node => {
    const txt = node.innerText || "";
    if (!txt) return;
    if (!/Due\b/i.test(txt) && !/(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\b/i.test(txt)) return;
    const title = extractTitle(node);
    const date = extractDate(txt);
    if (!title || !date) return;
    const key = `${title}||${date}`;
    if (seen.has(key)) return;
    seen.add(key);
    dueItems.push({ title, date });
  });

  debugLog("found dueItems", dueItems);

  if (dueItems.length > 0) {
    chrome.storage.sync.get("dueDates", (data) => {
      let existing = data.dueDates || [];
      dueItems.forEach(item => {
        if (!existing.some(e => e.title === item.title && e.date === item.date)) {
          existing.push(item);
        }
      });
      chrome.storage.sync.set({ dueDates: existing }, () => {
        debugLog("Saved dueDates:", existing);
      });
    });
  }
}

// run once and observe DOM changes
function startScraper() {
  debugLog("startScraper");
  scrapeDueDates();
  const observer = new MutationObserver(() => {
    if (observer._timeout) clearTimeout(observer._timeout);
    observer._timeout = setTimeout(() => {
      scrapeDueDates();
    }, 300);
  });
  observer.observe(document, { childList: true, subtree: true });
}

if (document.readyState === "complete" || document.readyState === "interactive") {
  startScraper();
} else {
  window.addEventListener("DOMContentLoaded", startScraper, { once: true });
}
