console.log("DUE-SCRAPER: content.js loaded on", location.href);

const DEBUG = true;
function debugLog(...args) { if (DEBUG) console.log("DUE-SCRAPER:", ...args); }

// Only run on D2L/Brightspace pages
function isD2LPage() {
  return location.hostname.includes('d2l') || 
         location.hostname.includes('brightspace') ||
         document.querySelector('[class*="d2l"]') ||
         document.title.includes('D2L') ||
         document.title.includes('Brightspace');
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
  
  debugLog("Looking for assignments in page content...");
  
  // Method 1: Look for table rows with due dates
  const rows = document.querySelectorAll('tr, .d2l-list-item, [role="row"], .d2l-table-row');
  
  rows.forEach((row) => {
    const text = row.textContent || '';
    
    // Skip rows that don't contain due date patterns
    if (!text.match(/Due on|Due:|until|submission|assignment/i)) return;
    if (!text.match(/[A-Za-z]{3} \d{1,2}, \d{4}/)) return;
    
    // Extract due date
    const dueMatch = text.match(/(Due on|Due:)\s*([A-Za-z]+ \d{1,2}, \d{4} \d{1,2}:\d{2} [AP]M)/i);
    const dateStr = dueMatch ? dueMatch[2] : text.match(/[A-Za-z]+ \d{1,2}, \d{4} \d{1,2}:\d{2} [AP]M/)?.[0];
    
    if (!dateStr) return;
    
    const date = makeSafeDate(dateStr);
    if (!date) return;
    
    // Extract assignment title - look for the most prominent text
    let title = '';
    
    // Try to find text that looks like an assignment name
    const possibleTitles = text.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 3 && 
                     !line.includes('Due on') &&
                     !line.includes('Due:') &&
                     !line.match(/^\d+\s*\/\s*\d+$/) &&
                     !line.match(/^\d+\.$/) &&
                     !line.match(/[A-Za-z]{3} \d{1,2}, \d{4}/));
    
    if (possibleTitles.length > 0) {
      title = possibleTitles[0];
    } else {
      // Look for links or bold text
      const link = row.querySelector('a, [class*="title"], [class*="name"], strong, b');
      if (link && link.textContent) {
        title = link.textContent.trim();
      }
    }
    
    // Clean up title
    title = title.replace(/^\d+\.\s*/, '')
                 .replace(/â€"/g, '-')
                 .replace(/Due on.*$/, '')
                 .replace(/[-–].*$/, '')
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
  
  // Method 2: Look for any text content with due dates
  if (assignments.length === 0) {
    debugLog("Trying alternative scraping method...");
    
    const textContent = document.body.textContent || '';
    const dueDateMatches = textContent.matchAll(/Due on ([A-Za-z]+ \d{1,2}, \d{4} \d{1,2}:\d{2} [AP]M)/gi);
    
    for (const match of dueDateMatches) {
      const dateStr = match[1];
      const date = makeSafeDate(dateStr);
      if (!date) continue;
      
      // Try to find the assignment title near the due date
      const context = textContent.substring(Math.max(0, match.index - 200), match.index + 50);
      const lines = context.split('\n').filter(line => line.trim().length > 3);
      
      let title = lines[lines.length - 1] || '';
      title = title.replace(/^\d+\.\s*/, '')
                   .replace(/â€"/g, '-')
                   .replace(/Due on.*$/, '')
                   .trim();
      
      if (title && title.length > 3) {
        assignments.push({
          title: title,
          date: date.toISOString(),
          type: 'due',
          source: 'D2L'
        });
        debugLog(`Found assignment via text scan: "${title}" - ${date}`);
      }
    }
  }
  
  return assignments;
}

function scrapeDueDates() {
  debugLog("Starting D2L due date scraping...");
  
  const assignments = extractD2LAssignments();
  debugLog(`Found ${assignments.length} assignments total`);
  
  if (assignments.length > 0) {
    chrome.storage.sync.get("dueDates", (data) => {
      let existing = data.dueDates || [];
      
      // Filter out non-D2L entries
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
      
      // Store back
      chrome.storage.sync.set({ dueDates: d2lOnly }, () => {
        debugLog("D2L due dates saved to storage:", d2lOnly.length, "items");
        // Send message to popup to refresh
        chrome.runtime.sendMessage({action: "refreshDueDates"});
      });
    });
  } else {
    debugLog("No D2L assignments found on this page");
    // Check if we're on an assignments page
    const pageTitle = document.title;
    const pageContent = document.body.textContent || '';
    if (pageContent.includes('Assignment') || pageContent.includes('Due on')) {
      debugLog("Page appears to have assignments but none were found. Page structure may be different.");
      debugLog("Page title:", pageTitle);
    }
  }
}

// Run when page loads and also listen for SPA navigation
if (isD2LPage()) {
  // Initial scrape with delay
  setTimeout(scrapeDueDates, 5000);
  
  // Also try when user interacts with page (for SPAs)
  document.addEventListener('click', () => {
    setTimeout(scrapeDueDates, 2000);
  }, { once: true });
  
  // Observe DOM changes for dynamically loaded content
  const observer = new MutationObserver(() => {
    setTimeout(scrapeDueDates, 1000);
  });
  
  observer.observe(document.body, { 
    childList: true, 
    subtree: true,
    characterData: true 
  });
}