import { describe, it, expect } from "vitest";
import { formatMoney, numberToWords } from "@/routes/_authenticated/payslip";

describe("Payslip Studio — Salary Calculations & Formatting Suite", () => {
  describe("1. Currency Money Formatting", () => {
    it("formats INR currency correctly", () => {
      expect(formatMoney(75000, "INR")).toBe("₹75,000");
      expect(formatMoney(125000, "INR")).toBe("₹1,25,000");
    });

    it("formats USD currency correctly", () => {
      expect(formatMoney(5000, "USD")).toBe("$5,000");
    });

    it("formats EUR currency correctly", () => {
      expect(formatMoney(4500, "EUR")).toBe("€4,500");
    });

    it("formats GBP currency correctly", () => {
      expect(formatMoney(3800, "GBP")).toBe("£3,800");
    });
  });

  describe("2. Number to Words Conversion", () => {
    it("converts single digits and tens to words", () => {
      expect(numberToWords(0, "INR")).toBe("Zero");
      expect(numberToWords(5, "INR")).toBe("Five Rupees Only");
      expect(numberToWords(15, "INR")).toBe("Fifteen Rupees Only");
      expect(numberToWords(50, "INR")).toBe("Fifty Rupees Only");
    });

    it("converts hundreds, thousands, and lakhs to words", () => {
      expect(numberToWords(500, "INR")).toBe("Five Hundred Rupees Only");
      expect(numberToWords(75000, "INR")).toBe("Seventy Five Thousand Rupees Only");
      expect(numberToWords(125000, "INR")).toBe("One Lakh Twenty Five Thousand Rupees Only");
    });

    it("handles alternative currencies", () => {
      expect(numberToWords(5000, "USD")).toBe("Five Thousand Dollars Only");
      expect(numberToWords(4500, "EUR")).toBe("Four Thousand Five Hundred Euros Only");
    });
  });
});
