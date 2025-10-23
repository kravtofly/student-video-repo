import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * Debug endpoint to see what params Next.js is receiving
 * Usage: /api/debug/params?test=value
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.status(200).json({
    method: req.method,
    url: req.url,
    query: req.query,
    headers: {
      host: req.headers.host,
      'user-agent': req.headers['user-agent'],
    },
    message: 'Debug info - this helps diagnose parameter parsing issues',
  });
}
