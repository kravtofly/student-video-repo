// pages/review.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';

// Allow the Mux web component attributes in TSX
declare global {
  namespace JSX {
    interface IntrinsicElements {
      'mux-player': any;
    }
  }
}

type Video = {
  id: string;
  mux_playback_id?: string | null;
  playback_id?: string | null;
  title?: string | null;
};

type Note = { id: string; t_seconds: number; body: string; created_at: string };

export default function ReviewPage() {
  const [video, setVideo] = useState<Video | null>(null);
  const [playbackToken, setPlaybackToken] = useState<string | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [summary, setSummary] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const params = useMemo(() => new URLSearchParams(typeof window !== 'undefined' ? window.location.search : ''), []);
  const videoId = params.get('videoId') || '';
  const coachEmail = params.get('coachEmail') || '';

  const playerRef = useRef<any>(null);

  useEffect(() => {
    (async () => {
      if (!videoId) { setErr('Missing videoId'); setLoading(false); return; }
      try {
        const res = await fetch(`/api/svr/submission/${encodeURIComponent(videoId)}`);
        const json = await res.json();
        if (!res.ok || json.error) throw new Error(json.error || `HTTP ${res.status}`);
        setVideo(json.submission);
        setPlaybackToken(json.playbackToken);
      } catch (e:any) {
        setErr(e.message || 'Failed to load submission');
      } finally {
        setLoading(false);
      }
    })();
  }, [videoId]);

  async function loadNotes() {
    if (!videoId) return;
    try {
      const res = await fetch(`/api/svr/notes?videoId=${encodeURIComponent(videoId)}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setNotes(json.notes || []);
    } catch (e:any) {
      setErr(e.message || 'Failed to load notes');
    }
  }

  useEffect(() => { loadNotes(); }, [videoId]);

  async function addNote() {
    if (!videoId) return;
    const player: any = document.getElementById('player');
    const t = Math.floor((player?.currentTime || 0) as number);
    const body = window.prompt(`Note @ ${format(t)}`) || '';
    if (!body.trim()) return;
    await fetch('/api/svr/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoId, coachEmail, t, body })
    });
    await loadNotes();
  }

  async function markReviewed() {
    if (!videoId) return;
    await fetch('/api/svr/mark-reviewed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoId, coachEmail, reviewSummary: summary || null })
    });
    alert('Student notified!');
    window.location.href = '/'; // or a “coach dashboard” URL when you add one in this app
  }

  const playbackId = video?.mux_playback_id || video?.playback_id;

  return (
    <>
      <Head>
        <title>Review | Krāv</title>
        {/* mux-player web component */}
        <script src="https://cdn.jsdelivr.net/npm/@mux/mux-player"></script>
      </Head>

      <main style={{maxWidth: 1100, margin: '40px auto', padding: 16, fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial'}}>
        <h1 style={{margin: '0 0 16px 0'}}>Coach Review</h1>

        {loading && <p>Loading…</p>}
        {err && <p style={{color:'#b00'}}>{err}</p>}

        {video && playbackId && playbackToken && (
          <div style={{display:'grid', gridTemplateColumns: '1.2fr .8fr', gap: 16, alignItems:'start'}}>
            <div>
              <mux-player
                id="player"
                ref={playerRef as any}
                style={{width:'100%', height:'auto', borderRadius: 12, overflow:'hidden'} as any}
                stream-type="on-demand"
                playback-id={playbackId}
                tokens={JSON.stringify({ playback: playbackToken })}
              />
              <div style={{opacity:.7, fontSize:12, marginTop:8}}>{video.title || ''}</div>
            </div>

            <div>
              <h3 style={{margin:'0 0 8px 0'}}>Timestamped Notes</h3>

              <div style={{margin:'8px 0'}}>
                {!!notes.length ? notes.map(n => (
                  <div key={n.id} style={{padding:'6px 8px', border:'1px solid #eee', borderRadius:8, marginBottom:6}}>
                    <strong>{format(n.t_seconds)}</strong> — {n.body}
                  </div>
                )) : <p style={{opacity:.7}}>No notes yet.</p>}
              </div>

              <div style={{display:'flex', gap:8}}>
                <button onClick={addNote} style={btn}>Add note at current time</button>
              </div>

              <hr style={{margin:'16px 0'}} />

              <textarea
                value={summary}
                onChange={e => setSummary(e.target.value)}
                placeholder="Optional review summary…"
                style={{width:'100%', height:96, padding:8, borderRadius:8, border:'1px solid #ddd'}}
              />
              <div style={{display:'flex', gap:8, marginTop:8}}>
                <button onClick={markReviewed} style={btnPrimary}>Mark Reviewed & Notify Student</button>
              </div>
            </div>
          </div>
        )}

        {!playbackId && !loading && <p style={{color:'#b00'}}>Missing playback id for this video.</p>}
      </main>
    </>
  );
}

const btn: React.CSSProperties = { padding:'8px 12px', borderRadius:10, border:'1px solid #ddd', background:'#fafafa', cursor:'pointer' };
const btnPrimary: React.CSSProperties = { ...btn, background:'#111', color:'#fff', borderColor:'#111' };

function format(s: number) {
  s = Math.max(0, Math.floor(s));
  const m = Math.floor(s / 60);
  const ss = String(s % 60).padStart(2, '0');
  return `${m}:${ss}`;
}
