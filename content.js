console.log("DUE-SCRAPER: content.js loaded on", location.href);

const DEBUG = true;
function debugLog(...args) { if (DEBUG) console.log("DUE-SCRAPER:", ...args); }

// Only run on D2L/Brightspace pages
function isD2LPage() {
  return location.hostname.includes('d2l') || 
         location.hostname.includes('brightspace') ||
         document.querySelector('[data-d2l-page-type]') ||
         document.querySelector('[class*="d2l"]');
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
    
    // Convert to 24-hour format
    if (isPM && hours < 12) hours += 12;
    if (!isPM && hours === 12) hours = 0;
    
    const date = new Date(year, month, day, hours, minutes);
    if (!isNaN(date)) return date;
  }
  
  return null;
}

function extractD2LAssignments() {
  const assignments = [];
  
  // Look for assignment rows - D2L specific selectors
  const selectors = [
    'tr.d2l-table-row',
    'tr.d2l-row',
    '.d2l-list-item',
    '.d2l-entity-row',
    '[data-type="assignment"]',
    'table tbody tr'
  ];
  
  const rows = document.querySelectorAll(selectors.join(', '));
  debugLog(`Found ${rows.length} potential assignment rows`);
  
  rows.forEach((row, index) => {
    const text = row.textContent || '';
    
    // Skip rows that don't contain "Due on" text
    if (!text.includes('Due on')) return;
    
    // Extract due date
    const dueMatch = text.match(/Due on ([A-Za-z]+ \d{1,2}, \d{4} \d{1,2}:\d{2} [AP]M)/i);
    if (!dueMatch) return;
    
    const date = makeSafeDate(dueMatch[1]);
    if (!date) return;
    
    // Extract assignment title - look for the most prominent text
    let title = '';
    
    // Try to find a link first (D2L usually puts assignment names in links)
    const link = row.querySelector('a[href*="assignments"], a[href*="dropbox"]');
    if (link && link.textContent.trim()) {
      title = link.textContent.trim();
    } else {
      // Fallback: find the first meaningful text that's not the due date
      const textNodes = Array.from(row.querySelectorAll('span, div, td'))
        .map(el => el.textContent.trim())
        .filter(t => t && !t.includes('Due on') && !t.match(/^\d+\s*\/\s*\d+$/) && t.length > 3);
      
      if (textNodes.length > 0) {
        title = textNodes[0];
      } else {
        // Last resort: use row text and clean it up
        title = text.split('\n')
          .map(line => line.trim())
          .find(line => line && !line.includes('Due on') && line.length > 3) || '';
      }
    }
    
    // Clean up title
    title = title.replace(/^\d+\.\s*/, '')
                 .replace(/â€"/g, '-')
                 .replace(/Due on.*$/, '')
                 .trim();
    
    if (!title || title.length < 3) return;
    
    assignments.push({
      title: title,
      date: date.toISOString(),
      type: 'due',
      source: 'D2L'
    });
    
    debugLog(`Found assignment: ${title} - ${date}`);
  });
  
  return assignments;
}

function scrapeDueDates() {
  debugLog("Starting D2L due date scraping...");
  
  const assignments = extractD2LAssignments();
  debugLog(`Found ${assignments.length} assignments total`);
  
  if (assignments.length > 0) {
    chrome.storage.sync.get("dueDates", (data) => {
      let existing = data.dueDates || [];
      
      // Filter out non-D2L entries to avoid mixing content
      const d2lOnly = existing.filter(item => item.source === 'D2L');
      
      // Add new D2L assignments
      assignments.forEach(newItem => {
        const exists = d2lOnly.some(existingItem => 
          existingItem.title === newItem.title && existingItem.date === newItem.date
        );
        
        if (!exists) {
          d2lOnly.push(newItem);
        }
      });
      
      // Sort by date
      d2lOnly.sort((a, b) => new Date(a.date) - new Date(b.date));
      
      // Store back (only D2L assignments)
      chrome.storage.sync.set({ dueDates: d2lOnly }, () => {
        debugLog("D2L due dates saved to storage:", d2lOnly.length, "items");
      });
    });
  } else {
    debugLog("No D2L assignments found on this page");
  }
}

// Run scraping with a delay to ensure page is loaded
setTimeout(scrapeDueDates, 3000);