// app/review/upload/page.tsx
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isUUID(v?: string | null) {
  return !!(
    v &&
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(
      v
    )
  );
}

type Search = { token?: string };

export default async function ReviewUploadPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  const token = searchParams?.token?.trim();
  if (!isUUID(token)) {
    return (
      <main className="mx-auto max-w-xl p-6">
        <h1 className="mb-4 text-2xl font-semibold">Upload Videos</h1>
        <p className="text-red-600">
          Invalid or missing upload token. Please use the link from Checkout.
        </p>
      </main>
    );
  }

  // Verify token is valid and not expired; accept only paid/uploading/in_review
  const { data: order, error } = await supabaseAdmin
    .from("review_orders")
    .select(
      "id, upload_token, token_expires_at, status, student_email, student_name, coach_id, coach_name, public_default"
    )
    .eq("upload_token", token)
    .in("status", ["paid", "uploading", "in_review"])
    .gt("token_expires_at", new Date().toISOString())
    .single();

  if (error || !order) {
    return (
      <main className="mx-auto max-w-xl p-6">
        <h1 className="mb-4 text-2xl font-semibold">Upload Videos</h1>
        <p className="text-red-600">
          This upload link is not valid anymore. Please contact support or purchase
          a new review.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="mb-2 text-2xl font-semibold">Upload Videos for Review</h1>
      <p className="mb-6 text-sm text-gray-600">
        Coach: <span className="font-medium">{order.coach_name ?? order.coach_id}</span> ·
        Student: <span className="font-medium">{order.student_email}</span>
      </p>

      {/* Client uploader */}
      <UploadForm
        orderId={order.id}
        studentEmail={order.student_email}
        studentName={order.student_name || ""}
        coachId={order.coach_id}
        coachName={order.coach_name || ""}
        defaultPublic={!!order.public_default}
      />
    </main>
  );
}

// Split to a client component for upload UX
import UploadForm from "./uploadForm";
