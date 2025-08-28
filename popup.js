const dueList = document.getElementById("due-list");
const addBtn = document.getElementById("add");

function loadDates() {
  chrome.storage.sync.get("dueDates", (data) => {
    dueList.innerHTML = "";
    (data.dueDates || []).forEach((item) => {
      const li = document.createElement("li");
      li.textContent = `${item.title} — ${item.date}`;
      dueList.appendChild(li);
    });
  });
}



addBtn.addEventListener("click", () => {
  const title = document.getElementById("title").value.trim();
  const date = document.getElementById("date").value;

  if (!title || !date) return; // stop if input empty

  chrome.storage.sync.get("dueDates", (data) => {
    const newList = data.dueDates || [];
    newList.push({ title, date });
    chrome.storage.sync.set({ dueDates: newList }, loadDates);
  });

  // clear inputs
  document.getElementById("title").value = "";
  document.getElementById("date").value = "";
});

loadDates();
