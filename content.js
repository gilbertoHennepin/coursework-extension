function scrapeDueDates() {
  const seen = new Set();
  let dueItems = [];

  // helper: extract a reasonable title from a node
  function extractTitle(node) {
    if (!node) return "";
    // prefer anchors/headings inside node
    const a = node.querySelector("a, h1, h2, h3, h4, strong");
    if (a && a.innerText.trim()) return a.innerText.trim();

    // walk up to find a sibling or ancestor with a link/heading
    let p = node;
    while (p && p !== document.body) {
      const link = p.querySelector("a, h1, h2, h3, h4, strong");
      if (link && link.innerText.trim()) return link.innerText.trim();
      p = p.parentElement;
    }

    // fallback: first non-empty line of text
    const txt = node.innerText || "";
    return txt.split("\n").map(s => s.trim()).find(Boolean) || "";
  }

  // helper: try to extract a date string from text
  function extractDate(text) {
    if (!text) return null;
    // "Due on Sep 1, 2025 11:59 PM" or "Due Sep 1, 2025"
    let m = text.match(/Due(?: on)?\s*([A-Za-z0-9,:\/\-\s]+?\d{4}(?:\s*\d{1,2}:\d{2}\s*(?:AM|PM)?)?)/i);
    if (m) return m[1].trim();

    // fallback: look for month name + day + year (e.g., Sep 1, 2025)
    m = text.match(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*[ .\-\/]*\d{1,2}[, ]*\s*\d{4}\b/i);
    if (m) return m[0].trim();

    // also accept ISO-like dates yyyy-mm-dd
    m = text.match(/\d{4}-\d{2}-\d{2}/);
    if (m) return m[0];

    return null;
  }

  // look for nodes likely to contain assignment info (rows, list items, cards)
  const candidates = Array.from(document.querySelectorAll("tr, li, .d2l-list-item, .d2l-listview, .d2l-card, .assignment, .d2l-activityfeed-item, .d2l-activity"));
  // add body as fallback so we still scan for "Due" anywhere
  if (!candidates.length) candidates.push(document.body);

  candidates.forEach(node => {
    const txt = node.innerText || "";
    if (!txt) return;
    if (!/Due\b/i.test(txt) && !/(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\b/i.test(txt) ) return;

    const title = extractTitle(node);
    const date = extractDate(txt);
    if (!title || !date) return;

    const key = `${title}||${date}`;
    if (seen.has(key)) return;
    seen.add(key);

    dueItems.push({ title, date });
  });

  if (dueItems.length > 0) {
    chrome.storage.sync.get("dueDates", (data) => {
      let existing = data.dueDates || [];

      dueItems.forEach(item => {
        if (!existing.some(e => e.title === item.title && e.date === item.date)) {
          existing.push(item);
        }
      });

      chrome.storage.sync.set({ dueDates: existing }, () => {
        // optional console for debugging
        console.log("Saved dueDates:", existing);
      });
    });
  }
}

// run once after page load and again if DOM changes (dynamic pages)
function startScraper() {
  scrapeDueDates();

  const observer = new MutationObserver((mutations) => {
    // small debounce to avoid spamming
    if (observer._timeout) clearTimeout(observer._timeout);
    observer._timeout = setTimeout(() => {
      scrapeDueDates();
    }, 300);
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === "complete" || document.readyState === "interactive") {
  startScraper();
} else {
  window.addEventListener("DOMContentLoaded", startScraper, { once: true });
}
