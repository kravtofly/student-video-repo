# Coach Dashboard - Separate Quick Review and Deep Dive Tabs

## Overview

The coach dashboard can now be split into two tabs:
- **Quick Review Tab** - Shows only Quick Review videos
- **Deep Dive Tab** - Shows only Deep Dive + 1-on-1 videos

Both tabs use the same styling and layout, just filtered by `offer_type`.

## Setup in Webflow

### 1. Create Tab Structure

In your Webflow coach dashboard page, create a tab component with two tabs:
- Tab 1: "Quick Review"
- Tab 2: "Deep Dive + 1-on-1"

### 2. Quick Review Tab Embed

In the Quick Review tab content area, add an Embed element with this code:

```html
<div id="quick-review-dashboard"></div>

<script>
(async function() {
  const API_BASE = 'https://student-video-repo.vercel.app';
  const coachEmail = 'COACH_EMAIL_HERE'; // Replace with Memberstack field or hardcode

  try {
    const res = await fetch(`${API_BASE}/api/svr/coach/submissions?coachEmail=${encodeURIComponent(coachEmail)}&offerType=quick`);
    const data = await res.json();

    const container = document.getElementById('quick-review-dashboard');

    if (!data.submissions || data.submissions.length === 0) {
      container.innerHTML = '<p style="color:#666;padding:20px">No Quick Review submissions yet.</p>';
      return;
    }

    // Render submissions
    container.innerHTML = data.submissions.map(v => `
      <div style="border:1px solid #e5e5e5;border-radius:12px;padding:16px;margin-bottom:12px;background:white">
        <div style="font-weight:600;margin-bottom:4px">${v.title || 'Untitled'}</div>
        <div style="font-size:12px;color:#666;margin-bottom:8px">
          ${v.owner_name || v.owner_email} · ${new Date(v.created_at).toLocaleDateString()}
        </div>
        <div style="display:flex;gap:8px">
          <a href="https://student-video-repo.vercel.app/review/${v.id}"
             target="_blank"
             style="padding:8px 14px;background:#111;color:#fff;border-radius:6px;text-decoration:none;font-size:14px">
            ${v.reviewed_at ? 'View Review' : 'Start Review'}
          </a>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Failed to load Quick Review submissions:', err);
    document.getElementById('quick-review-dashboard').innerHTML = '<p style="color:#d00">Failed to load submissions.</p>';
  }
})();
</script>
```

### 3. Deep Dive Tab Embed

In the Deep Dive tab content area, add an Embed element with this code:

```html
<div id="deep-dive-dashboard"></div>

<script>
(async function() {
  const API_BASE = 'https://student-video-repo.vercel.app';
  const coachEmail = 'COACH_EMAIL_HERE'; // Replace with Memberstack field or hardcode

  try {
    const res = await fetch(`${API_BASE}/api/svr/coach/submissions?coachEmail=${encodeURIComponent(coachEmail)}&offerType=deep`);
    const data = await res.json();

    const container = document.getElementById('deep-dive-dashboard');

    if (!data.submissions || data.submissions.length === 0) {
      container.innerHTML = '<p style="color:#666;padding:20px">No Deep Dive submissions yet.</p>';
      return;
    }

    // Render submissions
    container.innerHTML = data.submissions.map(v => `
      <div style="border:1px solid #e5e5e5;border-radius:12px;padding:16px;margin-bottom:12px;background:white">
        <div style="font-weight:600;margin-bottom:4px">${v.title || 'Untitled'}</div>
        <div style="font-size:12px;color:#666;margin-bottom:8px">
          ${v.owner_name || v.owner_email} · ${new Date(v.created_at).toLocaleDateString()}
        </div>
        <div style="display:flex;gap:8px">
          <a href="https://student-video-repo.vercel.app/review/${v.id}"
             target="_blank"
             style="padding:8px 14px;background:#111;color:#fff;border-radius:6px;text-decoration:none;font-size:14px">
            ${v.reviewed_at ? 'View Review' : 'Start Review'}
          </a>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Failed to load Deep Dive submissions:', err);
    document.getElementById('deep-dive-dashboard').innerHTML = '<p style="color:#d00">Failed to load submissions.</p>';
  }
})();
</script>
```

## Getting Coach Email Dynamically

If you're using Memberstack, replace `COACH_EMAIL_HERE` with:

```javascript
const coachEmail = window.$memberstackDom?.getCurrentMember?.()?.email || 'FALLBACK_EMAIL';
```

Or use a hidden field in Webflow that's populated by Memberstack:

```javascript
const coachEmail = document.getElementById('coach-email-field')?.textContent || 'FALLBACK_EMAIL';
```

## API Parameters

The `/api/svr/coach/submissions` endpoint accepts:

- `coachEmail` (string) - Coach's email address
- `coachId` (string) - Alternative: Coach's ID
- `coachRef` (string) - Alternative: Coach reference
- **`offerType` (string)** - Filter by review type:
  - `"quick"` - Quick Review only
  - `"deep"` - Deep Dive + 1-on-1 only
  - Omit parameter - Show all reviews

## Styling

Both embeds use the same styling, so they'll look identical. You can customize:
- Card borders and shadows
- Button colors and styles
- Font sizes and spacing
- Empty state messages

Just update the inline styles in the HTML template.

## Testing

1. Create a test Quick Review order
2. Create a test Deep Dive order
3. Upload videos for both
4. Check that each tab shows only its respective videos
5. Verify the "Start Review" / "View Review" buttons work correctly
