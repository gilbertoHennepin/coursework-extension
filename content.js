console.log("DUE-SCRAPER: content.js loaded on", location.href);

const DEBUG = true;
function debugLog(...args) { if (DEBUG) console.log("DUE-SCRAPER:", ...args); }

function monthNameToNum(m) {
  const map = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,sept:8,oct:9,nov:10,dec:11 };
  return map[m.toLowerCase().slice(0,3)];
}

function makeSafeDate(str) {
  if (!str) return null;
  let d = new Date(str);
  if (!isNaN(d)) return d;
  
  const now = new Date();
  const year = now.getFullYear();
  
  // Try to parse D2L format: "Aug 26, 2025 11:59 PM"
  const d2lMatch = str.match(/([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})\s+(\d{1,2}):(\d{2})\s+(AM|PM)/i);
  if (d2lMatch) {
    const month = monthNameToNum(d2lMatch[1]);
    const day = parseInt(d2lMatch[2], 10);
    const year = parseInt(d2lMatch[3], 10);
    let hours = parseInt(d2lMatch[4], 10);
    const minutes = parseInt(d2lMatch[5], 10);
    const isPM = d2lMatch[6].toUpperCase() === 'PM';
    
    if (isPM && hours < 12) hours += 12;
    if (!isPM && hours === 12) hours = 0;
    
    d = new Date(year, month, day, hours, minutes);
    if (!isNaN(d)) return d;
  }
  
  return null;
}

function extractAssignmentInfo() {
  const assignments = [];
  
  // Look for assignment rows in D2L
  const rows = document.querySelectorAll('tr, .d2l-table-row, .d2l-list-item');
  
  rows.forEach(row => {
    const text = row.textContent || '';
    
    // Look for "Due on" pattern specific to D2L
    const dueMatch = text.match(/Due on ([A-Za-z]+ \d{1,2}, \d{4} \d{1,2}:\d{2} [AP]M)/i);
    if (!dueMatch) return;
    
    // Extract title - look for the first meaningful text that's not the due date
    const titleElement = row.querySelector('a, .d2l-link, [title]') || row;
    let title = titleElement.textContent.trim();
    
    // Clean up title - remove numbers, scores, etc.
    title = title.split('\n')[0].trim();
    title = title.replace(/^\d+\.\s*/, ''); // Remove numbered prefixes
    title = title.replace(/â€"/g, '-'); // Clean up special chars
    title = title.replace(/Due on.*$/, '').trim(); // Remove due date from title
    
    if (!title || title.length < 3) return;
    
    const date = makeSafeDate(dueMatch[1]);
    if (!date) return;
    
    assignments.push({
      title: title,
      date: date.toISOString(),
      type: 'due'
    });
  });
  
  return assignments;
}

function scrapeDueDates() {
  debugLog("Starting D2L due date scraping...");
  
  const assignments = extractAssignmentInfo();
  debugLog("Found assignments:", assignments);
  
  if (assignments.length) {
    chrome.storage.sync.get("dueDates", (data) => {
      let existing = data.dueDates || [];
      
      // Add only new assignments
      assignments.forEach(newItem => {
        const exists = existing.some(existingItem => 
          existingItem.title === newItem.title && existingItem.date === newItem.date
        );
        
        if (!exists) {
          existing.push(newItem);
        }
      });
      
      // Sort by date
      existing.sort((a, b) => new Date(a.date) - new Date(b.date));
      
      // Store back
      chrome.storage.sync.set({ dueDates: existing }, () => {
        debugLog("Due dates saved to storage:", existing);
      });
    });
  } else {
    debugLog("No assignments found on this page");
  }
}

// Run when page loads
if (location.href.includes('d2l') || location.href.includes('brightspace')) {
  setTimeout(scrapeDueDates, 2000); // Wait for page to load
}