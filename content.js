function scrapeDueDates() {
  let dueItems = [];

  // Look for all <strong> elements
  const nodes = document.querySelectorAll("strong");

  nodes.forEach(node => {
    const text = node.innerText;
    if (text && text.startsWith("Due on")) {
      dueItems.push(text.trim());
    }
  });

  if (dueItems.length > 0) {
    chrome.storage.sync.get("dueDates", (data) => {
      let existing = data.dueDates || [];

      dueItems.forEach(d => {
        // Only add if not already saved
        if (!existing.some(e => e.title === d)) {
          existing.push({ title: d, date: "auto" });
        }
      });

      chrome.storage.sync.set({ dueDates: existing });
    });
  }
}

window.addEventListener("load", scrapeDueDates);
