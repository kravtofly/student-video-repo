// app/coach/loading.tsx
export default function Loading() {
  return (
    <main className="mx-auto max-w-6xl p-6">
      <h1 className="mb-4 text-2xl font-semibold">Latest Videos</h1>
      <div className="space-y-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-40 animate-pulse rounded-2xl bg-gray-200" />
        ))}
      </div>
    </main>
  );
}
