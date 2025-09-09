# Session State Recovery Architecture

## The Problem
Dental portals require login, but we don't want to re-login every time we extract data.

## The Solution: Browser + Context Separation

### ❌ What DOESN'T work:
```javascript
// This closes EVERYTHING, losing session fingerprint
const context = await chromium.launchPersistentContext(userDir);
await context.close(); // Kills everything!
```

### ✅ What WORKS (MetLife Architecture):
```javascript
// Step 1: Launch browser (separate)
const browser = await chromium.launch({ headless });

// Step 2: Create context with saved state
const context = await browser.newContext({
  storageState: 'session-state.json' // Cookies + localStorage
});

// Step 3: After login, save state
await context.storageState({ path: 'session-state.json' });

// Step 4: Close ONLY context, not browser
await context.close();
await browser.close();
```

## Why This Works
- Saves complete session (cookies + localStorage)
- Restores exact state on next run
- Sites recognize the "same" browser session

## Currently Implemented In:
- ✅ MetLife (`src/metlife/portal-auth-manager.ts`)
- ✅ DNOA (`portal-web/dnoa-service.js`)
- 🔄 DentaQuest (pending)

## Production Notes
- Sessions will expire faster on Render (server restarts)
- But the principle remains the same
- Consider implementing a "session freshness check" before extractions