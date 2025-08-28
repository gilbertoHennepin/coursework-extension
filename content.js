function scrapeDueDates() {
  let dueItems = [];

  // Grab all assignment rows in the table
  const rows = document.querySelectorAll("tr");

  rows.forEach(row => {
    const text = row.innerText;
    if (text && text.includes("Due on")) {
      // Example: "Module 01 - Introduction to Systems Development\nDue on Sep 1, 2025 11:59 PM"
      const parts = text.split("\n");
      const title = parts[0].trim();
      const due = parts.find(p => p.startsWith("Due on")).replace("Due on ", "");

      dueItems.push({ title, date: due });
    }
  });

  if (dueItems.length > 0) {
    chrome.storage.sync.get("dueDates", (data) => {
      let existing = data.dueDates || [];

      dueItems.forEach(item => {
        if (!existing.some(e => e.title === item.title && e.date === item.date)) {
          existing.push(item);
        }
      });

      chrome.storage.sync.set({ dueDates: existing });
    });
  }
}

window.addEventListener("load", scrapeDueDates);
