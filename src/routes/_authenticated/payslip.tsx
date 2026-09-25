import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { format } from "date-fns";
import {
  Building2,
  Calculator,
  Check,
  Copy,
  DollarSign,
  Download,
  FileSpreadsheet,
  FileText,
  Printer,
  Receipt,
  RotateCcw,
  Sparkles,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { STAGE_LABELS } from "@/lib/hr";
import { useCandidates, type Candidate } from "@/lib/queries";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/payslip")({
  head: () => ({
    meta: [
      { title: "Employee Payslip Studio | aiHIVE HR" },
      {
        name: "description",
        content:
          "Generate, customize, and copy professional employee salary payslips for instant email or messaging dispatch.",
      },
      { property: "og:title", content: "Employee Payslip Studio | aiHIVE HR" },
      { property: "og:type", content: "website" },
    ],
  }),
  component: PayslipPage,
});

export type CurrencySymbol = "INR" | "USD" | "EUR" | "GBP";

const CURRENCY_SYMBOLS: Record<CurrencySymbol, string> = {
  INR: "₹",
  USD: "$",
  EUR: "€",
  GBP: "£",
};

export function formatMoney(amount: number, currency: CurrencySymbol = "INR"): string {
  const symbol = CURRENCY_SYMBOLS[currency] || "₹";
  const formattedNumber = Math.round(amount).toLocaleString();
  return `${symbol}${formattedNumber}`;
}

export function numberToWords(num: number, currency: CurrencySymbol = "INR"): string {
  if (!num || isNaN(num)) return "Zero";

  const a = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
  ];
  const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  function inWords(n: number): string {
    if (n < 20) return a[n] || "";
    if (n < 100) return `${b[Math.floor(n / 10)]} ${a[n % 10]}`.trim();
    if (n < 1000)
      return `${a[Math.floor(n / 100)]} Hundred ${inWords(n % 100)}`.trim();
    if (n < 100000)
      return `${inWords(Math.floor(n / 1000))} Thousand ${inWords(n % 1000)}`.trim();
    if (n < 10000000)
      return `${inWords(Math.floor(n / 100000))} Lakh ${inWords(n % 100000)}`.trim();
    return `${inWords(Math.floor(n / 10000000))} Crore ${inWords(n % 10000000)}`.trim();
  }

  const wordResult = inWords(Math.round(num));
  const currencyName =
    currency === "INR"
      ? "Rupees Only"
      : currency === "USD"
        ? "Dollars Only"
        : currency === "EUR"
          ? "Euros Only"
          : "Pounds Only";

  return `${wordResult} ${currencyName}`.trim();
}

export interface PayslipState {
  employeeId: string;
  employeeName: string;
  designation: string;
  department: string;
  payPeriod: string;
  bankAccount: string;
  panNumber: string;
  paidDays: string;
  currency: CurrencySymbol;
  // Earnings
  basicPay: number;
  hra: number;
  specialAllowance: number;
  bonus: number;
  // Deductions
  providentFund: number;
  taxDeduction: number;
  healthInsurance: number;
}

const DEFAULT_STATE: PayslipState = {
  employeeId: "SEC-EMP-2026-089",
  employeeName: "Ananya Deshmukh",
  designation: "Senior DevOps Architect",
  department: "Infrastructure & Security",
  payPeriod: "September 2026",
  bankAccount: "HDFC Bank •••• 9821",
  panNumber: "ABCDE1234F",
  paidDays: "22 days",
  currency: "INR",
  basicPay: 75000,
  hra: 30000,
  specialAllowance: 15000,
  bonus: 5000,
  providentFund: 9000,
  taxDeduction: 5000,
  healthInsurance: 1000,
};

export function PayslipPage() {
  const candidatesQuery = useCandidates();
  const candidates = candidatesQuery.data ?? [];
  const isLoadingCandidates = candidatesQuery.isLoading;

  const [selectedCandidateId, setSelectedCandidateId] = useState<string>("");
  const [form, setForm] = useState<PayslipState>(DEFAULT_STATE);
  const [copiedText, setCopiedText] = useState(false);
  const [copiedHtml, setCopiedHtml] = useState(false);

  // Auto-fill form when candidate is selected
  function handleSelectCandidate(candId: string) {
    setSelectedCandidateId(candId);
    const candidate = candidates.find((c) => c.id === candId);
    if (candidate) {
      setForm((prev) => ({
        ...prev,
        employeeName: candidate.full_name,
        designation: candidate.applied_role || prev.designation,
        employeeId: `SEC-EMP-${candidate.id.slice(0, 6).toUpperCase()}`,
      }));
      toast.success(`Loaded details for ${candidate.full_name}`);
    }
  }

  // Real-time Salary Calculations
  const grossEarnings = useMemo(() => {
    return (
      (form.basicPay || 0) +
      (form.hra || 0) +
      (form.specialAllowance || 0) +
      (form.bonus || 0)
    );
  }, [form.basicPay, form.hra, form.specialAllowance, form.bonus]);

  const totalDeductions = useMemo(() => {
    return (
      (form.providentFund || 0) +
      (form.taxDeduction || 0) +
      (form.healthInsurance || 0)
    );
  }, [form.providentFund, form.taxDeduction, form.healthInsurance]);

  const netSalary = useMemo(() => {
    return Math.max(0, grossEarnings - totalDeductions);
  }, [grossEarnings, totalDeductions]);

  const netWords = useMemo(() => {
    return numberToWords(netSalary, form.currency);
  }, [netSalary, form.currency]);

  // Formats clean plain-text payslip for copy-pasting into Email/Slack/WhatsApp
  const formattedPlainText = useMemo(() => {
    const sym = form.currency;
    return `===========================================================
        SECEON TALENT ACQUISITION & HR PORTAL
               MONTHLY SALARY PAYSLIP
===========================================================
EMPLOYEE DETAILS:
• Employee Name : ${form.employeeName}
• Employee ID   : ${form.employeeId}
• Designation   : ${form.designation}
• Department    : ${form.department}
• Pay Period    : ${form.payPeriod}
• Paid Days     : ${form.paidDays}
• Bank Account  : ${form.bankAccount}
• PAN / Tax ID  : ${form.panNumber}

-----------------------------------------------------------
EARNINGS BREAKDOWN:
• Basic Salary        : ${formatMoney(form.basicPay, sym)}
• House Rent Allowance: ${formatMoney(form.hra, sym)}
• Special Allowance   : ${formatMoney(form.specialAllowance, sym)}
• Bonus / Incentive   : ${formatMoney(form.bonus, sym)}
TOTAL GROSS EARNINGS  : ${formatMoney(grossEarnings, sym)}

-----------------------------------------------------------
DEDUCTIONS BREAKDOWN:
• Provident Fund (PF) : ${formatMoney(form.providentFund, sym)}
• Tax Deducted (TDS)  : ${formatMoney(form.taxDeduction, sym)}
• Health Insurance    : ${formatMoney(form.healthInsurance, sym)}
TOTAL DEDUCTIONS      : ${formatMoney(totalDeductions, sym)}

===========================================================
NET PAYABLE SALARY    : ${formatMoney(netSalary, sym)}
AMOUNT IN WORDS       : ${netWords}
===========================================================
* This is a computer-generated payslip issued by Seceon Talent Acquisition.`;
  }, [form, grossEarnings, totalDeductions, netSalary, netWords]);

  function copyTextToClipboard() {
    void navigator.clipboard
      ?.writeText(formattedPlainText)
      .then(() => {
        setCopiedText(true);
        toast.success("Payslip copied to clipboard! Ready to paste into Email or Chat.");
        setTimeout(() => setCopiedText(false), 3000);
      })
      .catch(() => toast.error("Could not copy payslip to clipboard."));
  }

  function printPayslip() {
    if (typeof window !== "undefined") {
      window.print();
    }
  }

  function resetForm() {
    setForm(DEFAULT_STATE);
    setSelectedCandidateId("");
    toast.info("Payslip form reset to default values.");
  }

  return (
    <AppShell
      title="Employee Payslip Studio"
      subtitle="Generate, customize, and copy standardized salary payslips for quick employee dispatch."
    >
      <div className="mb-5 flex items-start gap-3 rounded-lg border border-primary/25 bg-primary/10 px-4 py-3">
        <Receipt className="mt-0.5 size-4 shrink-0 text-primary" />
        <div>
          <p className="text-sm font-medium">Payslip Generator & HR Studio</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Select an employee or customize salary structure components below. Click <strong>&quot;Copy Payslip Content&quot;</strong> to copy a formatted text block ready for email or instant message dispatch.
          </p>
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-12">
        {/* Left Column: Input Form (6 cols) */}
        <div className="space-y-6 lg:col-span-6">
          {/* Card 1: Employee Information */}
          <section className="panel p-4 sm:p-5">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <UserCheck className="size-4 text-primary" />
                <h2 className="font-semibold">Step 1: Employee Information</h2>
              </div>
              <Button variant="ghost" size="sm" onClick={resetForm} title="Reset Form">
                <RotateCcw className="size-3.5" />
                Reset
              </Button>
            </div>

            <div className="mt-4 space-y-4">
              <div className="space-y-1.5">
                <Label>Quick Fill from Candidate Pipeline</Label>
                <Select value={selectedCandidateId} onValueChange={handleSelectCandidate}>
                  <SelectTrigger className="w-full">
                    <SelectValue
                      placeholder={isLoadingCandidates ? "Loading pipeline..." : "Select employee / candidate"}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {candidates.map((cand) => (
                      <SelectItem key={cand.id} value={cand.id}>
                        {cand.full_name} · {cand.applied_role || "Position"} · {STAGE_LABELS[cand.stage]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="emp-name">Employee Name</Label>
                  <Input
                    id="emp-name"
                    value={form.employeeName}
                    onChange={(e) => setForm({ ...form, employeeName: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="emp-id">Employee ID</Label>
                  <Input
                    id="emp-id"
                    value={form.employeeId}
                    onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="emp-role">Designation / Role</Label>
                  <Input
                    id="emp-role"
                    value={form.designation}
                    onChange={(e) => setForm({ ...form, designation: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="emp-dept">Department</Label>
                  <Input
                    id="emp-dept"
                    value={form.department}
                    onChange={(e) => setForm({ ...form, department: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="emp-period">Pay Period</Label>
                  <Input
                    id="emp-period"
                    value={form.payPeriod}
                    onChange={(e) => setForm({ ...form, payPeriod: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="emp-bank">Bank Account</Label>
                  <Input
                    id="emp-bank"
                    value={form.bankAccount}
                    onChange={(e) => setForm({ ...form, bankAccount: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="emp-pan">PAN / Tax ID</Label>
                  <Input
                    id="emp-pan"
                    value={form.panNumber}
                    onChange={(e) => setForm({ ...form, panNumber: e.target.value })}
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Card 2: Salary Structure Breakdown */}
          <section className="panel p-4 sm:p-5">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <Calculator className="size-4 text-primary" />
                <h2 className="font-semibold">Step 2: Earnings & Deductions</h2>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="currency-select" className="text-xs">Currency</Label>
                <Select
                  value={form.currency}
                  onValueChange={(val: CurrencySymbol) => setForm({ ...form, currency: val })}
                >
                  <SelectTrigger id="currency-select" className="h-8 w-24 text-xs font-semibold">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="INR">INR (₹)</SelectItem>
                    <SelectItem value="USD">USD ($)</SelectItem>
                    <SelectItem value="EUR">EUR (€)</SelectItem>
                    <SelectItem value="GBP">GBP (£)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="mt-4 space-y-5">
              {/* Earnings Sub-section */}
              <div>
                <p className="label-caps mb-2 text-primary font-semibold">Monthly Gross Earnings</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="basic-pay">Basic Salary</Label>
                    <Input
                      id="basic-pay"
                      type="number"
                      value={form.basicPay}
                      onChange={(e) => setForm({ ...form, basicPay: Number(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="hra-pay">HRA Allowance</Label>
                    <Input
                      id="hra-pay"
                      type="number"
                      value={form.hra}
                      onChange={(e) => setForm({ ...form, hra: Number(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="special-pay">Special Allowance</Label>
                    <Input
                      id="special-pay"
                      type="number"
                      value={form.specialAllowance}
                      onChange={(e) =>
                        setForm({ ...form, specialAllowance: Number(e.target.value) })
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="bonus-pay">Bonus / Incentive</Label>
                    <Input
                      id="bonus-pay"
                      type="number"
                      value={form.bonus}
                      onChange={(e) => setForm({ ...form, bonus: Number(e.target.value) })}
                    />
                  </div>
                </div>
              </div>

              {/* Deductions Sub-section */}
              <div className="border-t border-border pt-3">
                <p className="label-caps mb-2 text-destructive font-semibold">Monthly Deductions</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="pf-deduction">Provident Fund (PF)</Label>
                    <Input
                      id="pf-deduction"
                      type="number"
                      value={form.providentFund}
                      onChange={(e) =>
                        setForm({ ...form, providentFund: Number(e.target.value) })
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="tax-deduction">Income Tax / TDS</Label>
                    <Input
                      id="tax-deduction"
                      type="number"
                      value={form.taxDeduction}
                      onChange={(e) =>
                        setForm({ ...form, taxDeduction: Number(e.target.value) })
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="health-deduction">Health Insurance</Label>
                    <Input
                      id="health-deduction"
                      type="number"
                      value={form.healthInsurance}
                      onChange={(e) =>
                        setForm({ ...form, healthInsurance: Number(e.target.value) })
                      }
                    />
                  </div>
                </div>
              </div>

              {/* Calculation Summary Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-secondary/40 p-3 text-xs">
                <div>
                  <span className="text-muted-foreground">Gross Earnings: </span>
                  <span className="font-semibold text-foreground">
                    {formatMoney(grossEarnings, form.currency)}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Deductions: </span>
                  <span className="font-semibold text-destructive">
                    {formatMoney(totalDeductions, form.currency)}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Net Pay: </span>
                  <span className="font-bold text-primary">
                    {formatMoney(netSalary, form.currency)}
                  </span>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Right Column: Payslip Preview & Copy Actions (6 cols) */}
        <div className="space-y-6 lg:col-span-6">
          <section className="panel overflow-hidden p-4 sm:p-6" id="printable-payslip">
            {/* Header / Brand */}
            <div className="flex items-start justify-between border-b border-border pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <Building2 className="size-5 text-primary" />
                  <h1 className="text-lg font-bold tracking-tight">SECEON HR PORTAL</h1>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Talent Acquisition & Employee Payroll Division
                </p>
              </div>
              <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary font-semibold">
                SALARY PAYSLIP
              </Badge>
            </div>

            {/* Employee Info Grid */}
            <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 border-b border-border pb-4 text-xs">
              <div>
                <span className="text-muted-foreground">Employee Name: </span>
                <span className="font-semibold text-foreground">{form.employeeName}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Employee ID: </span>
                <span className="font-semibold text-foreground">{form.employeeId}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Designation: </span>
                <span className="font-medium text-foreground">{form.designation}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Department: </span>
                <span className="font-medium text-foreground">{form.department}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Pay Period: </span>
                <span className="font-medium text-foreground">{form.payPeriod}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Paid Days: </span>
                <span className="font-medium text-foreground">{form.paidDays}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Bank Account: </span>
                <span className="font-medium text-foreground">{form.bankAccount}</span>
              </div>
              <div>
                <span className="text-muted-foreground">PAN / Tax ID: </span>
                <span className="font-medium text-foreground">{form.panNumber}</span>
              </div>
            </div>

            {/* Earnings & Deductions Side-by-Side Breakdown */}
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Earnings Table */}
              <div className="rounded-md border border-border bg-secondary/30 p-3">
                <p className="mb-2 text-xs font-bold text-primary uppercase tracking-wider">Earnings</p>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Basic Salary</span>
                    <span className="font-medium">{formatMoney(form.basicPay, form.currency)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">HRA Allowance</span>
                    <span className="font-medium">{formatMoney(form.hra, form.currency)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Special Allowance</span>
                    <span className="font-medium">{formatMoney(form.specialAllowance, form.currency)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Bonus / Incentive</span>
                    <span className="font-medium">{formatMoney(form.bonus, form.currency)}</span>
                  </div>
                  <div className="flex justify-between border-t border-border pt-2 font-semibold">
                    <span>Gross Earnings</span>
                    <span>{formatMoney(grossEarnings, form.currency)}</span>
                  </div>
                </div>
              </div>

              {/* Deductions Table */}
              <div className="rounded-md border border-border bg-secondary/30 p-3">
                <p className="mb-2 text-xs font-bold text-destructive uppercase tracking-wider">Deductions</p>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Provident Fund (PF)</span>
                    <span className="font-medium">{formatMoney(form.providentFund, form.currency)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Income Tax (TDS)</span>
                    <span className="font-medium">{formatMoney(form.taxDeduction, form.currency)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Health Insurance</span>
                    <span className="font-medium">{formatMoney(form.healthInsurance, form.currency)}</span>
                  </div>
                  <div className="flex justify-between border-t border-border pt-2 font-semibold">
                    <span>Total Deductions</span>
                    <span className="text-destructive">{formatMoney(totalDeductions, form.currency)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Net Salary Highlight Banner */}
            <div className="mt-4 rounded-lg border border-primary/40 bg-primary/10 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-primary uppercase">Net Payable Salary</p>
                  <p className="text-xl font-extrabold text-foreground">
                    {formatMoney(netSalary, form.currency)}
                  </p>
                </div>
                <Badge variant="default" className="text-xs">
                  Net Salary
                </Badge>
              </div>
              <p className="mt-2 text-xs font-medium text-muted-foreground">
                In words: <span className="font-semibold text-foreground">{netWords}</span>
              </p>
            </div>

            {/* Footer */}
            <p className="mt-4 text-center text-[0.6875rem] text-muted-foreground">
              This is a computer-generated salary payslip issued by Seceon HR & Talent Acquisition.
            </p>
          </section>

          {/* One-Click HR Actions Bar */}
          <section className="panel p-4 sm:p-5">
            <h3 className="text-sm font-semibold mb-2">HR Copy & Export Actions</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Copy the standardized payslip formatted text to paste directly into Email, Slack, Teams, or WhatsApp to send to the employee.
            </p>

            <div className="flex flex-wrap gap-3">
              <Button className="flex-1" onClick={copyTextToClipboard}>
                {copiedText ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
                {copiedText ? "Copied to Clipboard!" : "Copy Payslip Content"}
              </Button>

              <Button variant="outline" onClick={printPayslip}>
                <Printer className="size-4" />
                Print / Save PDF
              </Button>
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
