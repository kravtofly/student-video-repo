// pages/api/svr/manage-mux-assets.ts
// Utility endpoint to list and clean up Mux assets
import type { NextApiRequest, NextApiResponse } from 'next';
import Mux from '@mux/mux-node';

const mux = new Mux({
  tokenId: process.env.MUX_TOKEN_ID!,
  tokenSecret: process.env.MUX_TOKEN_SECRET!,
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Simple auth - require a secret key to prevent unauthorized access
  const authKey = req.headers['x-admin-key'] || req.query.key;
  if (authKey !== process.env.SVR_JWT_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const action = req.query.action || 'list';

    if (action === 'list') {
      // List all assets with their details
      const assets = await mux.video.assets.list({ limit: 100 });

      const assetDetails = assets.map((asset: any) => {
        let metadata: any = {};
        try {
          metadata = asset.passthrough ? JSON.parse(asset.passthrough) : {};
        } catch {}

        return {
          id: asset.id,
          status: asset.status,
          duration: asset.duration,
          created_at: asset.created_at,
          type: metadata.type || 'unknown',
          passthrough: asset.passthrough,
        };
      });

      // Separate into categories
      const comments = assetDetails.filter((a: any) => a.type === 'comment');
      const studentVideos = assetDetails.filter((a: any) => a.type !== 'comment');

      return res.json({
        total: assetDetails.length,
        comments: comments.length,
        studentVideos: studentVideos.length,
        assets: assetDetails,
      });
    }

    if (action === 'delete-old-comments') {
      // Delete comment assets older than X days (default 30 days)
      const daysOld = parseInt(req.query.days as string) || 30;
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const assets = await mux.video.assets.list({ limit: 100 });
      const deleted: string[] = [];

      for (const asset of assets) {
        let metadata: any = {};
        try {
          metadata = asset.passthrough ? JSON.parse(asset.passthrough) : {};
        } catch {}

        // Only delete comment assets older than cutoff
        if (metadata.type === 'comment') {
          const createdAt = new Date(asset.created_at);
          if (createdAt < cutoffDate) {
            await mux.video.assets.delete(asset.id);
            deleted.push(asset.id);
            console.log(`[manage-mux-assets] Deleted old comment asset: ${asset.id}`);
          }
        }
      }

      return res.json({
        deleted: deleted.length,
        assetIds: deleted,
      });
    }

    if (action === 'delete-asset') {
      // Delete a specific asset by ID
      const assetId = req.query.assetId as string;
      if (!assetId) {
        return res.status(400).json({ error: 'assetId required' });
      }

      await mux.video.assets.delete(assetId);
      return res.json({ ok: true, deleted: assetId });
    }

    return res.status(400).json({ error: 'Invalid action. Use: list, delete-old-comments, or delete-asset' });
  } catch (err: any) {
    console.error('[manage-mux-assets] Error:', err);
    return res.status(500).json({ error: err.message || 'Failed to manage assets' });
  }
}
