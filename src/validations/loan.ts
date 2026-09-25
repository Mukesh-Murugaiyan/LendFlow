import { z } from 'zod';

export const createLoanSchema = z.object({
  // Borrower Information
  existing_borrower_id: z.string().optional(),
  full_name: z.string().min(2, 'Full name must be at least 2 characters'),
  mobile_number: z.string().min(10, 'Mobile number must be at least 10 digits'),
  alternate_mobile_number: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  pincode: z.string().optional(),
  government_id: z.string().optional(),
  occupation: z.string().optional(),
  reference_name: z.string().optional(),
  reference_mobile: z.string().optional(),
  borrower_notes: z.string().optional(),

  // Loan Details
  principal_amount: z.number().positive('Principal amount must be greater than 0'),
  interest_rate: z.number().min(0, 'Interest rate cannot be negative'),
  interest_type: z.enum(['SIMPLE', 'MONTHLY_CALENDAR']),
  interest_interval_days: z.number().int().positive('Interval must be at least 1 day'),
  loan_start_date: z.string().min(10, 'Loan start date is required (YYYY-MM-DD)'),
  first_interest_due_date: z.string().min(10, 'First interest due date is required (YYYY-MM-DD)'),
  loan_notes: z.string().optional(),
});

export type CreateLoanFormData = z.infer<typeof createLoanSchema>;

export const borrowerSchema = z.object({
  full_name: z.string().min(2, 'Full name is required'),
  mobile_number: z.string().min(10, 'Valid 10-digit mobile number required'),
  alternate_mobile_number: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  pincode: z.string().optional(),
  government_id: z.string().optional(),
  occupation: z.string().optional(),
  reference_name: z.string().optional(),
  reference_mobile: z.string().optional(),
  notes: z.string().optional(),
});

export type BorrowerFormData = z.infer<typeof borrowerSchema>;
