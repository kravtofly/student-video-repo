# Mux Asset Management Guide

## Problem
Mux free plan is limited to 10 assets. Once you exceed this limit, you cannot create new direct uploads (audio/video comments will fail with a 400 error).

## Solution Options

### Option 1: Clean Up Old Assets (Immediate Fix)

I've created a utility endpoint to help you manage Mux assets. Here's how to use it:

#### 1. List all assets
```bash
curl "https://student-video-repo.vercel.app/api/svr/manage-mux-assets?action=list&key=YOUR_SVR_JWT_SECRET"
```

This will show:
- Total number of assets
- How many are comment assets vs student videos
- Details about each asset (ID, creation date, type)

#### 2. Delete old comment assets
```bash
# Delete comment assets older than 30 days (default)
curl "https://student-video-repo.vercel.app/api/svr/manage-mux-assets?action=delete-old-comments&key=YOUR_SVR_JWT_SECRET"

# Or specify custom age (e.g., 7 days)
curl "https://student-video-repo.vercel.app/api/svr/manage-mux-assets?action=delete-old-comments&days=7&key=YOUR_SVR_JWT_SECRET"
```

**⚠️ Warning:** This will permanently delete audio/video comment recordings. Students will still see the timestamp markers, but the audio/video will be gone.

#### 3. Delete specific asset by ID
```bash
curl "https://student-video-repo.vercel.app/api/svr/manage-mux-assets?action=delete-asset&assetId=ASSET_ID_HERE&key=YOUR_SVR_JWT_SECRET"
```

### Option 2: Upgrade Mux Plan (Long-term Solution)

Mux pricing (as of 2024):
- **Free Plan**: 10 assets, 500 minutes encoding
- **Pay-as-you-go**: $0.005/minute encoding, $0.002/minute streaming
  - No asset limit
  - ~$5-10/month for light usage
- **Starter Plan**: $20/month
  - 1,000 minutes encoding included
  - Unlimited assets

**Recommended for production:** Pay-as-you-go or Starter plan

To upgrade:
1. Log in to https://dashboard.mux.com
2. Navigate to Settings → Billing
3. Add payment method and select plan

### Option 3: Manual Cleanup via Mux Dashboard

1. Go to https://dashboard.mux.com
2. Navigate to Video → Assets
3. Look for assets with `"type":"comment"` in the passthrough data
4. Delete old/test comment assets manually
5. Keep student video assets (these are the main uploaded videos, not comments)

## Best Practice

For production use:
1. **Upgrade to paid Mux plan** - Most sustainable solution
2. **Implement automatic cleanup** - Delete comment assets older than 90 days
3. **Monitor usage** - Set up alerts when approaching limits

## Quick Commands Reference

Replace `YOUR_SVR_JWT_SECRET` with your actual JWT secret from environment variables.

```bash
# Check current assets
curl "https://student-video-repo.vercel.app/api/svr/manage-mux-assets?action=list&key=YOUR_SVR_JWT_SECRET" | jq

# Free up space (delete comments older than 7 days)
curl "https://student-video-repo.vercel.app/api/svr/manage-mux-assets?action=delete-old-comments&days=7&key=YOUR_SVR_JWT_SECRET"
```

## Notes

- Student videos should NOT be deleted automatically - these are the main content
- Audio/video comments are supplementary and can be cleaned up as needed
- The free plan is suitable for testing but not production use
- Each audio/video comment creates one Mux asset (counts toward limit)
