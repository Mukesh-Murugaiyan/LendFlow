import { calculateInterestAmount, formatCurrency, maskGovernmentId } from '../financial';
import { calculateNextDueDate, isOverdue } from '../date';

describe('Financial Calculation and Formatting Unit Tests', () => {
  // Acceptance Test Scenario Arun Kumar
  test('Exact Scenario: ₹10,000 principal at 5% interest rate produces ₹500.00', () => {
    const interest = calculateInterestAmount(10000, 5);
    expect(interest).toBe(500);
  });

  test('Decimal precision: ₹25,000 at 3.75% rate produces exact ₹937.50', () => {
    const interest = calculateInterestAmount(25000, 3.75);
    expect(interest).toBe(937.5);
  });

  test('Edge cases: 0 or negative values return 0', () => {
    expect(calculateInterestAmount(0, 5)).toBe(0);
    expect(calculateInterestAmount(-10000, 5)).toBe(0);
    expect(calculateInterestAmount(10000, -1)).toBe(0);
  });

  test('Indian currency formatting', () => {
    expect(formatCurrency(10000)).toBe('₹10,000.00');
    expect(formatCurrency(1250000)).toBe('₹12,50,000.00');
    expect(formatCurrency(500)).toBe('₹500.00');
    expect(formatCurrency(0)).toBe('₹0.00');
  });

  test('Aadhaar / Government ID masking', () => {
    const res = maskGovernmentId('9876 5432 4321');
    expect(res.last4).toBe('4321');
    expect(res.masked).toBe('XXXX-XXXX-4321');
  });

  test('Due date calculation for 30-day interval', () => {
    // 25 Sep 2026 + 30 days -> 25 Oct 2026 (September has 30 days)
    const nextDue = calculateNextDueDate('2026-09-25', 30);
    expect(nextDue).toBe('2026-10-25');
  });

  test('Overdue detection for past dates', () => {
    expect(isOverdue('2020-01-01')).toBe(true);
    expect(isOverdue('2099-01-01')).toBe(false);
  });
});
