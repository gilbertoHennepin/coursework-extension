console.log("DUE-SCRAPER: content.js loaded on", location.href);

const DEBUG = true;
function debugLog(...args) { if (DEBUG) console.log("DUE-SCRAPER:", ...args); }

// Only run on D2L/Brightspace pages
function isD2LPage() {
  return location.hostname.includes('d2l') || 
         location.hostname.includes('brightspace') ||
         document.querySelector('[class*="d2l"]') ||
         document.title.includes('Assignment') ||
         document.querySelector('a[href*="assignments"]');
}

if (!isD2LPage()) {
  debugLog("Not a D2L page, skipping scraping");
  return;
}

function monthNameToNum(m) {
  const map = { jan:0, feb:1, mar:2, apr:3, may:4, jun:5, jul:6, aug:7, sep:8, sept:8, oct:9, nov:10, dec:11 };
  return map[m.toLowerCase().slice(0,3)];
}

function makeSafeDate(dateStr) {
  if (!dateStr) return null;
  
  // Handle D2L format: "Aug 26, 2025 11:59 PM"
  const match = dateStr.match(/([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})\s+(\d{1,2}):(\d{2})\s+(AM|PM)/i);
  if (match) {
    const month = monthNameToNum(match[1]);
    const day = parseInt(match[2], 10);
    const year = parseInt(match[3], 10);
    let hours = parseInt(match[4], 10);
    const minutes = parseInt(match[5], 10);
    const isPM = match[6].toUpperCase() === 'PM';
    
    if (isPM && hours < 12) hours += 12;
    if (!isPM && hours === 12) hours = 0;
    
    const date = new Date(year, month, day, hours, minutes);
    if (!isNaN(date)) return date;
  }
  
  return null;
}

function scrapeAllDueDates() {
  debugLog("Scanning entire page for due dates...");
  const assignments = [];
  const text = document.body.textContent;
  
  // Find all due date patterns in the entire page
  const dueDateRegex = /Due on ([A-Za-z]+ \d{1,2}, \d{4} \d{1,2}:\d{2} [AP]M)/gi;
  let match;
  
  while ((match = dueDateRegex.exec(text)) !== null) {
    const dateStr = match[1];
    const date = makeSafeDate(dateStr);
    if (!date) continue;
    
    // Find the assignment title - look backwards from the due date
    const start = Math.max(0, match.index - 200);
    const context = text.substring(start, match.index);
    const lines = context.split('\n').filter(line => line.trim().length > 3);
    
    let title = lines[lines.length - 1] || 'Unknown Assignment';
    title = title.trim()
                .replace(/^\d+\.\s*/, '')
                .replace(/[-–].*$/, '')
                .replace(/Due on.*$/, '')
                .replace(/\s+/g, ' ')
                .trim();
    
    if (title.length > 2) {
      assignments.push({
        title: title,
        date: date.toISOString(),
        type: 'due',
        source: 'D2L'
      });
      debugLog(`Found: "${title}" - ${date}`);
    }
  }
  
  return assignments;
}

function saveAssignments(assignments) {
  if (assignments.length === 0) {
    debugLog("No assignments found");
    return;
  }
  
  chrome.storage.sync.get("dueDates", (data) => {
    let existing = data.dueDates || [];
    
    // Clear old D2L entries and add new ones
    const nonD2L = existing.filter(item => item.source !== 'D2L');
    const updated = [...nonD2L, ...assignments];
    
    // Remove duplicates
    const unique = updated.filter((item, index, self) =>
      index === self.findIndex(t => t.title === item.title && t.date === item.date)
    );
    
    // Sort by date
    unique.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    chrome.storage.sync.set({ dueDates: unique }, () => {
      debugLog(`Saved ${assignments.length} D2L assignments`);
      chrome.runtime.sendMessage({action: "refreshDueDates"});
    });
  });
}

// Main execution
if (isD2LPage()) {
  setTimeout(() => {
    const assignments = scrapeAllDueDates();
    saveAssignments(assignments);
  }, 3000);
}