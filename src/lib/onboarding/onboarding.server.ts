import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type OnboardingStatus = Database["public"]["Tables"]["onboarding"]["Row"]["status"];
export type OnboardingDocumentStatus =
  Database["public"]["Tables"]["onboarding_documents"]["Row"]["document_status"];
export type OnboardingEventType =
  Database["public"]["Tables"]["onboarding_events"]["Row"]["event_type"];

export interface OnboardingEligibilityResult {
  eligible: boolean;
  reason?: string | undefined;
  candidate?: Database["public"]["Tables"]["candidates"]["Row"] | undefined;
  activeOnboarding?: Database["public"]["Tables"]["onboarding"]["Row"] | null | undefined;
  acceptedOffer?: Database["public"]["Tables"]["offers"]["Row"] | null | undefined;
  defaultStartDate?: string | null | undefined;
}

export interface PublicOnboardingPortalData {
  status: OnboardingStatus;
  start_date: string | null;
  candidate: {
    full_name: string;
  };
  job: {
    title: string;
    department?: string | null;
  };
  documents: Array<{
    id: string;
    requirement_key: string;
    title: string;
    description: string | null;
    is_required: boolean;
    document_status: OnboardingDocumentStatus;
    document_name: string | null;
    file_size_bytes: number | null;
    uploaded_at: string | null;
    review_notes: string | null;
  }>;
}

/**
 * Backend Authoritative Eligibility Check for Onboarding.
 *
 * Rules:
 * 1. Candidate must exist.
 * 2. Candidate backend application_status === 'hired'.
 * 3. Candidate cannot have an existing active onboarding record (NOT_STARTED or IN_PROGRESS).
 * 4. Retrieves accepted offer start_date to ensure start date consistency.
 */
export async function verifyOnboardingEligibility(
  supabase: SupabaseClient<Database>,
  candidateId: string,
): Promise<OnboardingEligibilityResult> {
  const { data: candidate, error: candError } = await supabase
    .from("candidates")
    .select("*")
    .eq("id", candidateId)
    .maybeSingle();

  if (candError || !candidate) {
    return { eligible: false, reason: "Candidate not found." };
  }

  // Authoritative Status Verification: ONLY application_status = 'hired'
  if (candidate.application_status !== "hired") {
    return {
      eligible: false,
      reason: `Only candidates with application status 'hired' are eligible for onboarding. Current status: ${candidate.application_status}.`,
      candidate,
    };
  }

  // Active onboarding check (NOT_STARTED or IN_PROGRESS)
  const { data: activeRecords, error: activeError } = await supabase
    .from("onboarding")
    .select("*")
    .eq("candidate_id", candidateId)
    .in("status", ["NOT_STARTED", "IN_PROGRESS"]);

  if (activeError) {
    return { eligible: false, reason: "Could not query active onboarding records." };
  }

  const activeOnboarding = activeRecords && activeRecords.length > 0 ? activeRecords[0] : null;
  if (activeOnboarding) {
    return {
      eligible: false,
      reason: `Candidate already has an active onboarding record in '${activeOnboarding.status}' status.`,
      candidate,
      activeOnboarding,
    };
  }

  // Find accepted offer for start_date consistency
  const { data: acceptedOffers } = await supabase
    .from("offers")
    .select("*")
    .eq("candidate_id", candidateId)
    .eq("status", "ACCEPTED")
    .order("created_at", { ascending: false });

  const acceptedOffer = acceptedOffers && acceptedOffers.length > 0 ? acceptedOffers[0] : null;

  return {
    eligible: true,
    candidate,
    activeOnboarding: null,
    acceptedOffer,
    defaultStartDate: acceptedOffer?.start_date ?? null,
  };
}

/**
 * Record an audit event in onboarding_events (append-only).
 */
export async function recordOnboardingEvent(
  supabase: SupabaseClient<Database>,
  input: {
    onboardingId: string;
    candidateId: string;
    eventType: OnboardingEventType;
    notes?: string | null;
    createdBy?: string | null;
  },
): Promise<void> {
  await supabase.from("onboarding_events").insert({
    onboarding_id: input.onboardingId,
    candidate_id: input.candidateId,
    event_type: input.eventType,
    notes: input.notes ?? null,
    created_by: input.createdBy ?? null,
  });
}

/**
 * Atomically creates onboarding record, default document requirements, and ONBOARDING_CREATED event.
 * Uses DB RPC create_onboarding_atomic (returns generated raw_token once to caller).
 */
export async function createOnboardingAtomic(
  supabase: SupabaseClient<Database>,
  input: {
    candidateId: string;
    startDate?: string | null | undefined;
    createdBy?: string | null | undefined;
  },
): Promise<{
  onboarding: Database["public"]["Tables"]["onboarding"]["Row"];
  rawToken: string;
  tokenExpiresAt: string;
  documents: Database["public"]["Tables"]["onboarding_documents"]["Row"][];
}> {
  // 1. Authoritative Backend Eligibility Check
  const eligibility = await verifyOnboardingEligibility(supabase, input.candidateId);
  if (!eligibility.eligible) {
    throw new Error(eligibility.reason || "Candidate is not eligible for onboarding.");
  }

  const startDate = input.startDate || eligibility.defaultStartDate || null;

  // 2. Call SECURITY DEFINER RPC create_onboarding_atomic
  const rpcArgs: { p_candidate_id: string; p_start_date?: string } = {
    p_candidate_id: input.candidateId,
    ...(startDate ? { p_start_date: startDate } : {}),
  };
  const { data: rpcData, error: rpcError } = await supabase.rpc(
    "create_onboarding_atomic",
    rpcArgs,
  );

  if (rpcError || !rpcData) {
    throw new Error(rpcError?.message || "Could not initiate onboarding.");
  }

  const parsed = (typeof rpcData === "string" ? JSON.parse(rpcData) : rpcData) as {
    id: string;
    candidate_id: string;
    job_id: string | null;
    start_date: string | null;
    status: OnboardingStatus;
    raw_token: string;
    token_expires_at: string;
  };

  // 3. Fetch full created onboarding and document rows
  const { data: fullRecord, error: fetchError } = await supabase
    .from("onboarding")
    .select("*")
    .eq("id", parsed.id)
    .single();

  if (fetchError || !fullRecord) {
    throw new Error("Could not retrieve created onboarding record.");
  }

  const { data: documents } = await supabase
    .from("onboarding_documents")
    .select("*")
    .eq("onboarding_id", parsed.id)
    .order("created_at", { ascending: true });

  return {
    onboarding: fullRecord,
    rawToken: parsed.raw_token,
    tokenExpiresAt: parsed.token_expires_at,
    documents: documents ?? [],
  };
}

/**
 * Rotates candidate token and returns new raw_token.
 * Uses DB RPC resend_onboarding_invite_atomic (FOR UPDATE row lock serialization).
 */
export async function resendOnboardingInviteAtomic(
  supabase: SupabaseClient<Database>,
  onboardingId: string,
): Promise<{
  rawToken: string;
  tokenExpiresAt: string;
  candidateId: string;
}> {
  const { data: rpcData, error: rpcError } = await supabase.rpc("resend_onboarding_invite_atomic", {
    p_onboarding_id: onboardingId,
  });

  if (rpcError || !rpcData) {
    throw new Error(rpcError?.message || "Could not regenerate onboarding invitation link.");
  }

  const parsed = (typeof rpcData === "string" ? JSON.parse(rpcData) : rpcData) as {
    id: string;
    candidate_id: string;
    raw_token: string;
    token_expires_at: string;
  };

  return {
    rawToken: parsed.raw_token,
    tokenExpiresAt: parsed.token_expires_at,
    candidateId: parsed.candidate_id,
  };
}

/**
 * Resolves candidate token into public portal data via SECURITY DEFINER RPC.
 * Automatically transitions NOT_STARTED -> IN_PROGRESS on first view.
 */
export async function resolveOnboardingToken(
  supabase: SupabaseClient<Database>,
  token: string,
): Promise<PublicOnboardingPortalData> {
  const { data, error } = await supabase.rpc("resolve_onboarding_token", {
    p_token: token,
  });

  if (error || !data) {
    throw new Error(error?.message || "Invalid or expired onboarding link.");
  }

  return (typeof data === "string" ? JSON.parse(data) : data) as PublicOnboardingPortalData;
}

/**
 * Validates magic bytes for uploaded file buffers.
 */
export function validateFileMagicBytes(buffer: Buffer, mimeType: string): boolean {
  if (buffer.length < 4) return false;

  if (mimeType === "application/pdf") {
    // PDF starts with %PDF- (0x25, 0x50, 0x44, 0x46, 0x2D)
    return (
      buffer[0] === 0x25 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x44 &&
      buffer[3] === 0x46 &&
      buffer[4] === 0x2d
    );
  }

  if (mimeType === "image/png") {
    // PNG starts with \x89PNG (0x89, 0x50, 0x4E, 0x47)
    return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  }

  if (mimeType === "image/jpeg" || mimeType === "image/jpg") {
    // JPEG starts with 0xFF, 0xD8, 0xFF
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }

  return false;
}

/**
 * Handles candidate document upload:
 * 1. Token validation against SHA-256 hash.
 * 2. File size (<= 8MB), mime type, and magic bytes verification.
 * 3. Upload to private storage bucket 'onboarding-documents'.
 * 4. Document row update (status -> PENDING_REVIEW, reset review notes).
 * 5. Emits ONBOARDING_DOC_UPLOADED audit event.
 */
export async function uploadCandidateDocument(
  adminSupabase: SupabaseClient<Database>,
  input: {
    token: string;
    documentId: string;
    fileBuffer: Buffer;
    fileName: string;
    mimeType: string;
  },
): Promise<{
  success: boolean;
  document: Database["public"]["Tables"]["onboarding_documents"]["Row"];
}> {
  // 1. Hash incoming token with SHA-256
  const tokenHash = crypto.createHash("sha256").update(input.token).digest("hex");

  // Validate onboarding by token hash
  const { data: onboarding, error: onbError } = await adminSupabase
    .from("onboarding")
    .select("*")
    .eq("candidate_token_hash", tokenHash)
    .is("token_revoked_at", null)
    .maybeSingle();

  if (onbError || !onboarding) {
    throw new Error("Invalid or revoked onboarding invitation link.");
  }

  if (onboarding.token_expires_at && new Date(onboarding.token_expires_at) < new Date()) {
    throw new Error("Onboarding invitation link has expired.");
  }

  if (onboarding.status === "CANCELLED") {
    throw new Error("This onboarding process has been cancelled.");
  }

  if (onboarding.status === "COMPLETED") {
    throw new Error("This onboarding process is already completed.");
  }

  // 2. Locate document requirement row
  const { data: docRow, error: docError } = await adminSupabase
    .from("onboarding_documents")
    .select("*")
    .eq("id", input.documentId)
    .eq("onboarding_id", onboarding.id)
    .maybeSingle();

  if (docError || !docRow) {
    throw new Error("Document requirement not found for this onboarding.");
  }

  // 3. File validation: Size <= 8MB (8,388,608 bytes)
  const MAX_BYTES = 8 * 1024 * 1024;
  if (input.fileBuffer.length > MAX_BYTES) {
    throw new Error("File size exceeds 8 MB limit.");
  }

  const ALLOWED_MIMES = ["application/pdf", "image/png", "image/jpeg", "image/jpg"];
  if (!ALLOWED_MIMES.includes(input.mimeType)) {
    throw new Error("Invalid file type. Allowed formats: PDF, PNG, JPEG.");
  }

  // Magic bytes inspection
  if (!validateFileMagicBytes(input.fileBuffer, input.mimeType)) {
    throw new Error("File content does not match the specified file extension/type.");
  }

  // 4. Upload to private storage bucket 'onboarding-documents'
  const sanitizedFileName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `${onboarding.id}/${docRow.id}_${Date.now()}_${sanitizedFileName}`;

  // If previous file exists, clean it up to prevent orphaned files
  if (docRow.storage_path) {
    try {
      await adminSupabase.storage.from("onboarding-documents").remove([docRow.storage_path]);
    } catch (_ignore) {
      // Best effort cleanup
    }
  }

  const { error: uploadError } = await adminSupabase.storage
    .from("onboarding-documents")
    .upload(storagePath, input.fileBuffer, {
      contentType: input.mimeType,
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`Document upload failed: ${uploadError.message}`);
  }

  // 5. Update onboarding_documents row
  const now = new Date().toISOString();
  const { data: updatedDoc, error: updateError } = await adminSupabase
    .from("onboarding_documents")
    .update({
      storage_path: storagePath,
      document_name: sanitizedFileName,
      file_size_bytes: input.fileBuffer.length,
      mime_type: input.mimeType,
      document_status: "PENDING_REVIEW",
      review_notes: null,
      reviewed_by: null,
      reviewed_at: null,
      uploaded_at: now,
      updated_at: now,
    })
    .eq("id", docRow.id)
    .select()
    .single();

  if (updateError || !updatedDoc) {
    throw new Error("Could not update document metadata.");
  }

  // Ensure onboarding status is IN_PROGRESS
  if (onboarding.status === "NOT_STARTED") {
    await adminSupabase
      .from("onboarding")
      .update({ status: "IN_PROGRESS" })
      .eq("id", onboarding.id)
      .eq("status", "NOT_STARTED");
  }

  // 6. Record ONBOARDING_DOC_UPLOADED event
  await recordOnboardingEvent(adminSupabase, {
    onboardingId: onboarding.id,
    candidateId: onboarding.candidate_id,
    eventType: "ONBOARDING_DOC_UPLOADED",
    notes: `Candidate uploaded document "${sanitizedFileName}" for requirement "${docRow.title}".`,
    createdBy: null,
  });

  return {
    success: true,
    document: updatedDoc,
  };
}

/**
 * Review onboarding document (Staff action):
 * Decision: 'VERIFIED' or 'REJECTED' (rejection requires non-empty review_notes).
 */
export async function reviewOnboardingDocument(
  supabase: SupabaseClient<Database>,
  input: {
    onboardingId: string;
    documentId: string;
    decision: "VERIFIED" | "REJECTED";
    reviewNotes?: string | null;
    reviewerId: string;
  },
): Promise<Database["public"]["Tables"]["onboarding_documents"]["Row"]> {
  if (input.decision === "REJECTED" && (!input.reviewNotes || !input.reviewNotes.trim())) {
    throw new Error("Review notes are required when rejecting a document.");
  }

  const { data: doc, error: fetchErr } = await supabase
    .from("onboarding_documents")
    .select("*, onboarding(id, candidate_id)")
    .eq("id", input.documentId)
    .eq("onboarding_id", input.onboardingId)
    .single();

  if (fetchErr || !doc) {
    throw new Error("Onboarding document not found.");
  }

  const now = new Date().toISOString();
  const { data: updatedDoc, error: updateErr } = await supabase
    .from("onboarding_documents")
    .update({
      document_status: input.decision,
      review_notes: input.decision === "REJECTED" ? input.reviewNotes?.trim() || null : null,
      reviewed_by: input.reviewerId,
      reviewed_at: now,
      updated_at: now,
    })
    .eq("id", input.documentId)
    .select()
    .single();

  if (updateErr || !updatedDoc) {
    throw new Error(updateErr?.message || "Could not update document review status.");
  }

  // Record audit event
  const eventType: OnboardingEventType =
    input.decision === "VERIFIED" ? "ONBOARDING_DOC_VERIFIED" : "ONBOARDING_DOC_REJECTED";

  const notes =
    input.decision === "VERIFIED"
      ? `Document "${doc.title}" verified by recruiter.`
      : `Document "${doc.title}" rejected by recruiter. Reason: ${input.reviewNotes?.trim()}`;

  await recordOnboardingEvent(supabase, {
    onboardingId: input.onboardingId,
    candidateId: (doc.onboarding as unknown as { candidate_id: string })?.candidate_id,
    eventType,
    notes,
    createdBy: input.reviewerId,
  });

  return updatedDoc;
}

/**
 * Server-Side Completion Gate:
 * Strictly verifies all required documents (is_required = true) have document_status = 'VERIFIED'.
 * Race-safe conditional transition IN_PROGRESS -> COMPLETED.
 */
export async function completeOnboardingAtomic(
  supabase: SupabaseClient<Database>,
  input: {
    onboardingId: string;
    actorId?: string | null;
  },
): Promise<Database["public"]["Tables"]["onboarding"]["Row"]> {
  // 1. Query all documents for this onboarding
  const { data: docs, error: docErr } = await supabase
    .from("onboarding_documents")
    .select("id, title, is_required, document_status")
    .eq("onboarding_id", input.onboardingId);

  if (docErr) {
    throw new Error("Could not verify onboarding documents.");
  }

  const requiredDocs = (docs ?? []).filter((d) => d.is_required);
  const unverifiedDocs = requiredDocs.filter((d) => d.document_status !== "VERIFIED");

  if (unverifiedDocs.length > 0) {
    const names = unverifiedDocs.map((d) => `"${d.title}" (${d.document_status})`).join(", ");
    throw new Error(
      `Cannot complete onboarding: ${unverifiedDocs.length} required document(s) are not verified: ${names}.`,
    );
  }

  const completedAt = new Date().toISOString();

  // 2. Race-safe conditional transition IN_PROGRESS -> COMPLETED
  const { data: updated, error: updateError } = await supabase
    .from("onboarding")
    .update({
      status: "COMPLETED",
      completed_at: completedAt,
      updated_at: completedAt,
    })
    .eq("id", input.onboardingId)
    .eq("status", "IN_PROGRESS")
    .select()
    .maybeSingle();

  if (updateError) throw new Error("Could not complete onboarding.");
  if (!updated) {
    throw new Error(
      "Cannot complete onboarding: record is not currently IN_PROGRESS or transition conflict.",
    );
  }

  // 3. Exactly one ONBOARDING_COMPLETED audit event
  await recordOnboardingEvent(supabase, {
    onboardingId: updated.id,
    candidateId: updated.candidate_id,
    eventType: "ONBOARDING_COMPLETED",
    notes: `Onboarding completed successfully with all required compliance documents verified on ${completedAt}.`,
    createdBy: input.actorId ?? null,
  });

  return updated;
}
