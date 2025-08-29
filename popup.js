const dueList = document.getElementById("due-list");
const addBtn = document.getElementById("add");

function normalizeText(s) {
  if (!s) return "";
  // fix common mojibake for em-dash and trim
  return s.replace(/â€”/g, "—").replace(/\uFFFD/g, "—").normalize("NFC").trim();
}

function formatDateIso(iso) {
  try {
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    return d.toLocaleString();
  } catch (e) { return iso; }
}

function loadDates() {
  chrome.storage.sync.get("dueDates", (data) => {
    dueList.innerHTML = "";
    (data.dueDates || []).forEach((item) => {
      const li = document.createElement("li");
      li.className = item.type === "due" ? "due" : (item.type === "available-until" ? "available" : "");
      const title = normalizeText(item.title);
      const prettyDate = formatDateIso(item.date);
      if (item.type === "due") {
        li.textContent = `${title} — due ${prettyDate}`;
      } else if (item.type === "available-until") {
        li.textContent = `${title} — available until ${prettyDate}`;
      } else {
        li.textContent = `${title} — ${prettyDate}`;
      }
      dueList.appendChild(li);
    });
  });
}

addBtn.addEventListener("click", () => {
  const title = document.getElementById("title").value.trim();
  const date = document.getElementById("date").value;
  if (!title || !date) return;
  // by default user-added items are 'due'
  chrome.storage.sync.get("dueDates", (data) => {
    const newList = data.dueDates || [];
    // convert date input (YYYY-MM-DD) to ISO
    const iso = new Date(date).toISOString();
    newList.push({ title, date: iso, type: "due" });
    chrome.storage.sync.set({ dueDates: newList }, loadDates);
  });
  document.getElementById("title").value = "";
  document.getElementById("date").value = "";
});

loadDates();
