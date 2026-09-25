/**
 * HRIS & Payroll Integration Service (Server-only).
 * Manages the boundary for exporting hired candidate and onboarding compliance data
 * to external HRIS (Workday, BambooHR, Rippling) and Payroll (Gusto, Deel, ADP) systems.
 */
import crypto from "node:crypto";

export interface VerifiedDocumentSummary {
  requirementKey: string;
  title: string;
  documentStatus: string;
  verifiedAt: string;
}

export interface HrisEmployeePacket {
  candidateId: string;
  applicationCode: string;
  fullName: string;
  email: string;
  phone: string | null;
  location: string | null;
  jobTitle: string;
  department: string | null;
  employmentType: string | null;
  startDate: string | null;
  compensation: number | null;
  currency: string | null;
  verifiedDocuments: VerifiedDocumentSummary[];
  onboardingCompletedAt: string;
}

export interface IntegrationSyncResult {
  ok: boolean;
  status: "dispatched" | "deferred" | "failed";
  target: "HRIS" | "PAYROLL";
  reason?: string | undefined;
  timestamp: string;
}

/**
 * Signs an outbound integration payload using HMAC-SHA256.
 */
export function signOutboundPayload(payloadJson: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payloadJson, "utf8").digest("hex");
}

/**
 * Dispatches a completed onboarding record to an external HRIS endpoint.
 * Gracefully defers when HRIS_WEBHOOK_URL is not configured.
 */
export async function dispatchHrisSync(packet: HrisEmployeePacket): Promise<IntegrationSyncResult> {
  const url = process.env["HRIS_WEBHOOK_URL"];
  const secret = process.env["HRIS_WEBHOOK_SECRET"] || "hris-default-secret";

  if (!url) {
    return {
      ok: true,
      status: "deferred",
      target: "HRIS",
      reason: "HRIS webhook endpoint not configured in server environment.",
      timestamp: new Date().toISOString(),
    };
  }

  const payloadString = JSON.stringify({
    event: "employee.onboarding_completed",
    data: packet,
    timestamp: new Date().toISOString(),
  });

  const signature = signOutboundPayload(payloadString, secret);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-HRPortal-Signature": `sha256=${signature}`,
        "X-HRPortal-Timestamp": new Date().toISOString(),
        "X-HRPortal-Candidate-Id": packet.candidateId,
      },
      body: payloadString,
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      return {
        ok: false,
        status: "failed",
        target: "HRIS",
        reason: `HRIS endpoint returned status ${res.status}`,
        timestamp: new Date().toISOString(),
      };
    }

    return {
      ok: true,
      status: "dispatched",
      target: "HRIS",
      timestamp: new Date().toISOString(),
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Network error";
    return {
      ok: false,
      status: "failed",
      target: "HRIS",
      reason: `HRIS dispatch error: ${msg}`,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Dispatches hired compensation and tax compliance data to an external Payroll provider.
 * Gracefully defers when PAYROLL_WEBHOOK_URL is not configured.
 */
export async function dispatchPayrollSync(
  packet: HrisEmployeePacket,
): Promise<IntegrationSyncResult> {
  const url = process.env["PAYROLL_WEBHOOK_URL"];
  const secret = process.env["PAYROLL_WEBHOOK_SECRET"] || "payroll-default-secret";

  if (!url) {
    return {
      ok: true,
      status: "deferred",
      target: "PAYROLL",
      reason: "Payroll webhook endpoint not configured in server environment.",
      timestamp: new Date().toISOString(),
    };
  }

  const payrollPayload = {
    employeeId: packet.candidateId,
    fullName: packet.fullName,
    email: packet.email,
    startDate: packet.startDate,
    compensation: packet.compensation,
    currency: packet.currency,
    department: packet.department,
    complianceVerified: packet.verifiedDocuments.length > 0,
  };

  const payloadString = JSON.stringify({
    event: "payroll.employee_enrolled",
    data: payrollPayload,
    timestamp: new Date().toISOString(),
  });

  const signature = signOutboundPayload(payloadString, secret);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-HRPortal-Signature": `sha256=${signature}`,
        "X-HRPortal-Timestamp": new Date().toISOString(),
      },
      body: payloadString,
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      return {
        ok: false,
        status: "failed",
        target: "PAYROLL",
        reason: `Payroll endpoint returned status ${res.status}`,
        timestamp: new Date().toISOString(),
      };
    }

    return {
      ok: true,
      status: "dispatched",
      target: "PAYROLL",
      timestamp: new Date().toISOString(),
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Network error";
    return {
      ok: false,
      status: "failed",
      target: "PAYROLL",
      reason: `Payroll dispatch error: ${msg}`,
      timestamp: new Date().toISOString(),
    };
  }
}
