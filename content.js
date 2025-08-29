console.log("DUE-SCRAPER: content.js loaded on", location.href);

const DEBUG = true;
function debugLog(...args) { if (DEBUG) console.log("DUE-SCRAPER:", ...args); }

// Check if we're on a page with due dates
function hasDueDates() {
  return document.body.textContent.includes('Due on');
}

if (!hasDueDates()) {
  debugLog("No due dates found on this page, skipping");
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

function extractAssignmentsFromPage() {
  debugLog("Extracting assignments from page text...");
  const assignments = [];
  const text = document.body.textContent;
  
  // Find all due dates in the page
  const dueDateRegex = /Due on ([A-Za-z]+ \d{1,2}, \d{4} \d{1,2}:\d{2} [AP]M)/gi;
  let match;
  
  while ((match = dueDateRegex.exec(text)) !== null) {
    const dateStr = match[1];
    const date = makeSafeDate(dateStr);
    if (!date) continue;
    
    // Find the assignment title by looking at the structure around the due date
    const start = Math.max(0, match.index - 200);
    const end = Math.min(text.length, match.index + 100);
    const context = text.substring(start, end);
    
    // Look for assignment names - they're usually on previous lines
    const lines = context.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 2 && 
                     !line.includes('Due on') &&
                     !line.match(/^\d+\s*\/\s*\d+$/) &&
                     !line.match(/[A-Za-z]{3} \d{1,2}, \d{4}/) &&
                     !line.match(/^[0-9\.\s]+$/) &&
                     !line.match(/^[A-Za-z]+\s+\d{1,2}/)); // Exclude dates
    
    // The assignment title is usually the line just before the due date context
    if (lines.length > 0) {
      // Try to find the most likely title (usually the last meaningful line before the date)
      let title = '';
      for (let i = lines.length - 1; i >= 0; i--) {
        if (lines[i].length > 3 && !lines[i].match(/score|status|submission|feedback/i)) {
          title = lines[i];
          break;
        }
      }
      
      // If no good title found, use the last line
      if (!title && lines.length > 0) {
        title = lines[lines.length - 1];
      }
      
      // Clean up the title
      title = title.replace(/^\d+\.\s*/, '')
                   .replace(/[-–].*$/, '')
                   .replace(/Due on.*$/, '')
                   .replace(/\(.*\)/, '')
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
      } else {
        debugLog(`Could not extract title for date: ${date}`);
      }
    }
  }
  
  return assignments;
}

function saveAssignmentsToStorage(assignments) {
  if (assignments.length === 0) {
    debugLog("No assignments to save");
    return;
  }
  
  chrome.storage.sync.get("dueDates", (data) => {
    const existing = data.dueDates || [];
    
    // Create a new array with only these assignments (replace old D2L ones)
    const newAssignments = [
      ...existing.filter(item => item.source !== 'D2L'),
      ...assignments
    ];
    
    // Remove duplicates
    const uniqueAssignments = newAssignments.filter((item, index, self) =>
      index === self.findIndex(t => t.title === item.title && t.date === item.date)
    );
    
    // Sort by date
    uniqueAssignments.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    // Save to storage
    chrome.storage.sync.set({ dueDates: uniqueAssignments }, () => {
      debugLog(`Successfully saved ${assignments.length} assignments`);
      // Send message to popup to refresh (with error handling)
      try {
        chrome.runtime.sendMessage({action: "refreshDueDates"});
      } catch (e) {
        debugLog("Could not send refresh message:", e);
      }
    });
  });
}

// Clear any existing D2L data first to avoid duplicates
function clearOldD2LData() {
  chrome.storage.sync.get("dueDates", (data) => {
    const existing = data.dueDates || [];
    const nonD2L = existing.filter(item => item.source !== 'D2L');
    chrome.storage.sync.set({ dueDates: nonD2L });
  });
}

// Main execution with error handling
try {
  debugLog("Starting assignment extraction");
  clearOldD2LData();
  
  setTimeout(() => {
    try {
      const assignments = extractAssignmentsFromPage();
      debugLog(`Found ${assignments.length} assignments`);
      
      if (assignments.length > 0) {
        saveAssignmentsToStorage(assignments);
      } else {
        debugLog("No assignments found. Trying alternative approach...");
        
        // Alternative approach: look for specific D2L elements
        const d2lElements = document.querySelectorAll('[class*="d2l"], tr, li');
        debugLog(`Found ${d2lElements.length} potential D2L elements`);
      }
    } catch (e) {
      debugLog("Error in assignment extraction:", e);
    }
  }, 3000);
} catch (e) {
  debugLog("Initialization error:", e);
}