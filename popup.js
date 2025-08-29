const dueList = document.getElementById("due-list");
const addBtn = document.getElementById("add");

function normalizeText(s) {
  if (!s) return "";
  return s.replace(/â€"/g, "—").replace(/\uFFFD/g, "—").normalize("NFC").trim();
}

function formatDate(isoDate) {
  const date = new Date(isoDate);
  return date.toLocaleString('en-US', { 
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

function loadDates() {
  chrome.storage.sync.get("dueDates", (data) => {
    const list = document.getElementById("due-list");
    list.innerHTML = "";
    
    (data.dueDates || [])
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .forEach(item => {
        const li = document.createElement("li");
        li.className = "due";
        li.textContent = `${item.title} — ${formatDate(item.date)}`;

        const deleteBtn = document.createElement("button");
        deleteBtn.className = "delete-btn";
        deleteBtn.innerHTML = "×";
        deleteBtn.onclick = () => {
          const newDates = data.dueDates.filter(d => 
            d.title !== item.title || d.date !== item.date
          );
          chrome.storage.sync.set({ dueDates: newDates }, loadDates);
        };

        li.appendChild(deleteBtn);
        list.appendChild(li);
      });
  });
}

addBtn.addEventListener("click", () => {
  const title = document.getElementById("title").value.trim();
  const date = document.getElementById("date").value;
  if (!title || !date) return;
  
  chrome.storage.sync.get("dueDates", (data) => {
    const newList = data.dueDates || [];
    const iso = new Date(date).toISOString();
    newList.push({ title, date: iso, type: "due" });
    chrome.storage.sync.set({ dueDates: newList }, loadDates);
  });
  
  document.getElementById("title").value = "";
  document.getElementById("date").value = "";
});

// Initialize
document.addEventListener('DOMContentLoaded', loadDates);
