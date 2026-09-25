// Financial calculation & formatting utilities for LendFlow
// Adheres strictly to PostgreSQL NUMERIC precision conventions

/**
 * Calculates interest for a period based on principal and percentage rate
 * Formula: principal * rate / 100
 * @param principal numeric amount
 * @param rate interest rate in percent (e.g. 5 for 5%)
 * @returns calculated interest amount rounded to 2 decimal places
 */
export function calculateInterestAmount(principal: number, rate: number): number {
  if (!principal || !rate || principal <= 0 || rate < 0) {
    return 0;
  }
  const interest = (principal * rate) / 100;
  return Math.round((interest + Number.EPSILON) * 100) / 100;
}

/**
 * Formats a numeric amount to Indian Rupee currency format
 * e.g. 10000 -> ₹10,000.00, 1250000 -> ₹12,50,000.00
 */
export function formatCurrency(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return '₹0.00';
  }
  const fixed = amount.toFixed(2);
  const [integerPart, decimalPart] = fixed.split('.');
  
  // Format integerPart according to Indian numbering system (2,2,3)
  const isNegative = integerPart.startsWith('-');
  const rawInt = isNegative ? integerPart.slice(1) : integerPart;
  
  let lastThree = rawInt.substring(rawInt.length - 3);
  const otherNumbers = rawInt.substring(0, rawInt.length - 3);
  if (otherNumbers !== '') {
    lastThree = ',' + lastThree;
  }
  const formattedInt = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + lastThree;
  
  return `${isNegative ? '-' : ''}₹${formattedInt}.${decimalPart}`;
}

/**
 * Masks a government ID (like Aadhaar) keeping only last 4 digits
 * e.g. "1234 5678 9012" -> { masked: "XXXX-XXXX-9012", last4: "9012" }
 */
export function maskGovernmentId(idNumber?: string | null): { masked: string; last4: string } {
  if (!idNumber) {
    return { masked: '', last4: '' };
  }
  const cleaned = idNumber.replace(/\D/g, '');
  if (cleaned.length < 4) {
    return { masked: idNumber, last4: cleaned };
  }
  const last4 = cleaned.slice(-4);
  const masked = `XXXX-XXXX-${last4}`;
  return { masked, last4 };
}
