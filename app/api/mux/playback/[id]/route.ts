import type { NextRequest } from "next/server";
import { video } from "@/lib/mux"; // your Mux SDK client (already working elsewhere)

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function J(d: unknown, s = 200) {
  return new Response(JSON.stringify(d, null, 2), {
    status: s,
    headers: { "content-type": "application/json" },
  });
}

export async function GET(_req: NextRequest, ctx: { params: { id: string } }) {
  try {
    const id = ctx.params.id;
    // @ts-ignore - SDK typing varies, use 'any'
    const pb: any = await (video as any).playbackIds.retrieve(id);
    // pb.data => { id, policy, object: 'asset'|'live_stream', object_id: '...' }
    const meta: any = pb?.data || pb; // some SDKs wrap in .data
    let asset: any = null;
    if (meta?.object === "asset" && meta?.object_id) {
      // @ts-ignore
      const a = await (video as any).assets.retrieve(meta.object_id);
      asset = a?.data || a;
    }
    return J({ playback: meta, asset: asset ? { id: asset.id, status: asset.status } : null });
  } catch (e: any) {
    return J({ error: "LOOKUP_FAILED", message: e?.message || String(e) }, 500);
  }
}
