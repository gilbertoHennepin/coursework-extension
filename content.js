console.log("DUE-SCRAPER: content.js loaded on", location.href);

const DEBUG = true;
function debugLog(...args) { if (DEBUG) console.log("DUE-SCRAPER:", ...args); }

// Check if we're on a D2L assignments page
function isD2LAssignmentsPage() {
  const hasAssignments = document.querySelector('a[href*="assignments"], [data-type="assignment"]');
  const hasDueDates = document.body.textContent.includes('Due on');
  return hasAssignments || hasDueDates;
}

if (!isD2LAssignmentsPage()) {
  debugLog("Not a D2L assignments page, skipping");
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

function scrapeD2LAssignments() {
  debugLog("Scanning for D2L assignments...");
  const assignments = [];
  
  // Method 1: Look for table rows (most common D2L structure)
  const rows = document.querySelectorAll('tr, .d2l-list-item, [role="row"]');
  
  rows.forEach(row => {
    const text = row.textContent || '';
    
    // Skip rows without due dates
    if (!text.includes('Due on')) return;
    
    // Extract due date
    const dueMatch = text.match(/Due on ([A-Za-z]+ \d{1,2}, \d{4} \d{1,2}:\d{2} [AP]M)/i);
    if (!dueMatch) return;
    
    const date = makeSafeDate(dueMatch[1]);
    if (!date) return;
    
    // Extract assignment title - look for the most prominent text
    let title = '';
    
    // Try to find a link or heading
    const link = row.querySelector('a, [class*="title"], [class*="name"], strong, b, h1, h2, h3, h4');
    if (link && link.textContent && link.textContent.trim().length > 2) {
      title = link.textContent.trim();
    } else {
      // Fallback: find text that looks like an assignment name
      const lines = text.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 2 && 
                       !line.includes('Due on') &&
                       !line.match(/^\d+\s*\/\s*\d+$/) &&
                       !line.match(/[A-Za-z]{3} \d{1,2}, \d{4}/));
      
      if (lines.length > 0) {
        title = lines[0];
      }
    }
    
    // Clean up title
    title = title.replace(/^\d+\.\s*/, '')
                 .replace(/[-–].*$/, '')
                 .replace(/Due on.*$/, '')
                 .replace(/\s+/g, ' ')
                 .trim();
    
    if (!title || title.length < 3) return;
    
    assignments.push({
      title: title,
      date: date.toISOString(),
      type: 'due',
      source: 'D2L'
    });
    
    debugLog(`Found assignment: "${title}" - ${date}`);
  });
  
  // Method 2: If no rows found, scan entire page text
  if (assignments.length === 0) {
    debugLog("Trying text-based scanning...");
    const text = document.body.textContent;
    const dueDateRegex = /Due on ([A-Za-z]+ \d{1,2}, \d{4} \d{1,2}:\d{2} [AP]M)/gi;
    let match;
    
    while ((match = dueDateRegex.exec(text)) !== null) {
      const dateStr = match[1];
      const date = makeSafeDate(dateStr);
      if (!date) continue;
      
      // Find context around the due date
      const start = Math.max(0, match.index - 100);
      const end = Math.min(text.length, match.index + 50);
      const context = text.substring(start, end);
      
      // Look for assignment name in the context
      const lines = context.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 2 && !line.includes('Due on'));
      
      if (lines.length > 0) {
        const title = lines[lines.length - 1].replace(/Due on.*$/, '').trim();
        if (title.length > 2) {
          assignments.push({
            title: title,
            date: date.toISOString(),
            type: 'due',
            source: 'D2L'
          });
        }
      }
    }
  }
  
  return assignments;
}

function saveToStorage(assignments) {
  if (assignments.length === 0) {
    debugLog("No assignments found to save");
    return;
  }
  
  chrome.storage.sync.get("dueDates", (data) => {
    let existing = data.dueDates || [];
    
    // Remove any existing D2L entries to avoid duplicates
    const nonD2L = existing.filter(item => item.source !== 'D2L');
    const allAssignments = [...nonD2L, ...assignments];
    
    // Remove duplicates
    const unique = allAssignments.filter((item, index, self) =>
      index === self.findIndex(t => t.title === item.title && t.date === item.date)
    );
    
    // Sort by date
    unique.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    chrome.storage.sync.set({ dueDates: unique }, () => {
      debugLog(`Saved ${assignments.length} assignments to storage`);
      // Notify popup to refresh
      chrome.runtime.sendMessage({action: "refreshDueDates"});
    });
  });
}

// Main execution
debugLog("Starting D2L assignment extraction");
setTimeout(() => {
  const assignments = scrapeD2LAssignments();
  debugLog(`Found ${assignments.length} assignments`);
  saveToStorage(assignments);
}, 3000);

// Also try when clicking around (for single-page apps)
document.addEventListener('click', () => {
  setTimeout(() => {
    const assignments = scrapeD2LAssignments();
    saveToStorage(assignments);
  }, 1000);
});