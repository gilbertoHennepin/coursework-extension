function scrapeDueDates() {
  let dueItems = [];

  // Example selector: look for any element containing "Due"
  const allTextNodes = document.querySelectorAll("body *");

  allTextNodes.forEach(node => {
    const text = node.innerText;
    if (text && text.match(/Due/i)) {
      dueItems.push(text.trim());
    }
  });

  if (dueItems.length > 0) {
    chrome.storage.sync.get("dueDates", (data) => {
      let existing = data.dueDates || [];

      dueItems.forEach(d => {
        // Avoid duplicates
        if (!existing.some(e => e.title === d)) {
          existing.push({ title: d, date: "auto" });
        }
      });

      chrome.storage.sync.set({ dueDates: existing });
    });
  }
}

// Run when page loads
window.addEventListener("load", scrapeDueDates);
