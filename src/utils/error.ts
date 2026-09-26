/**
 * Centralized Error Formatter for LendFlow
 * Converts database, auth, and network errors into clear, actionable messages
 * directing users to contact the admin when permissions or activation issues occur.
 */

export function getFriendlyErrorMessage(err: any, fallbackMessage: string = 'An error occurred.'): string {
  if (!err) {
    return `${fallbackMessage} Please contact the admin.`;
  }

  const rawMessage = typeof err === 'string' ? err : err.message || '';
  const code = (err.code || '').toString().trim();
  const details = typeof err?.details === 'string' ? err.details : '';
  const combined = `${rawMessage} ${details}`.toLowerCase();
  const messageLower = rawMessage.toLowerCase();

  // 1. Authentication errors (clean, user-friendly auth alerts)
  if (
    messageLower.includes('invalid login credentials') ||
    messageLower.includes('invalid credentials') ||
    messageLower.includes('invalid_grant') ||
    messageLower.includes('invalid email or password')
  ) {
    return 'Invalid credentials: The email or password you entered is incorrect. Please check your details and try again.';
  }

  if (
    messageLower.includes('user not found') ||
    messageLower.includes('no user found') ||
    messageLower.includes('no address associated')
  ) {
    return 'User not found: No account exists with this email address. Please check your email or contact the admin.';
  }

  if (
    messageLower.includes('email not confirmed') ||
    messageLower.includes('email not verified')
  ) {
    return 'Email not verified: Please verify your email address to log in, or contact the admin.';
  }

  if (
    messageLower.includes('user already registered') ||
    messageLower.includes('already registered') ||
    messageLower.includes('user already exists')
  ) {
    return 'Account already exists: An account with this email is already registered. Please sign in instead.';
  }

  if (
    messageLower.includes('password should be at least') ||
    messageLower.includes('password is too short') ||
    messageLower.includes('weak password') ||
    messageLower.includes('signup requires a valid password')
  ) {
    return 'Password is too short: Password must be at least 6 characters long.';
  }

  if (
    messageLower.includes('invalid format') ||
    messageLower.includes('invalid email') ||
    messageLower.includes('unable to validate email')
  ) {
    return 'Invalid email address: Please enter a valid email format (e.g. name@example.com).';
  }

  if (
    messageLower.includes('rate limit') ||
    messageLower.includes('over_email_send_rate_limit') ||
    messageLower.includes('too many requests')
  ) {
    return 'Too many attempts: Please wait a moment before trying again, or contact the admin.';
  }

  // 2. Row Level Security / Permission Denied (Postgres 42501)
  if (
    code === '42501' ||
    combined.includes('row-level security') ||
    combined.includes('permission denied') ||
    combined.includes('violates row-level security policy')
  ) {
    return 'Access restricted: Your account has not been activated or granted permission for this action. Please contact the admin.';
  }

  // 3. Duplicate Record / Unique Constraint Violation (Postgres 23505)
  if (
    code === '23505' ||
    combined.includes('duplicate key') ||
    combined.includes('unique constraint')
  ) {
    return 'Duplicate record: A record with these details already exists. Please check your input.';
  }

  // 4. Foreign Key / Dependency Violation (Postgres 23503)
  if (
    code === '23503' ||
    combined.includes('foreign key constraint') ||
    combined.includes('is still referenced from table')
  ) {
    return 'Cannot complete action: This record is linked to other existing records and cannot be modified or deleted.';
  }

  // 5. Record Not Found (PGRST116)
  if (
    code === 'PGRST116' ||
    combined.includes('json object requested, multiple (or no) rows returned')
  ) {
    return 'Record not found: The requested item could not be found or has been removed.';
  }

  // 6. Missing required database column
  if (
    combined.includes('null value in column') ||
    combined.includes('violates not-null constraint')
  ) {
    return 'Missing required information: Please ensure all required fields are filled out correctly.';
  }

  // 7. Organization not found or not linked
  if (
    messageLower.includes('organization') ||
    messageLower.includes('default_organization_id') ||
    messageLower.includes('org id')
  ) {
    return 'Your account is not linked to an active organization. Please contact the admin to activate your account.';
  }

  // 8. User session / authentication token expired
  if (
    messageLower.includes('user session not found') ||
    messageLower.includes('jwt') ||
    messageLower.includes('session expired') ||
    messageLower.includes('token expired')
  ) {
    return 'User session expired or not found. Please sign in again. If the issue continues, please contact the admin.';
  }

  // 9. Network / connection issues
  if (
    messageLower.includes('network request failed') ||
    messageLower.includes('failed to fetch') ||
    messageLower.includes('networkerror') ||
    messageLower.includes('network error') ||
    messageLower.includes('offline')
  ) {
    return 'Network connection issue: Please check your internet connection or try again.';
  }

  // 10. Existing message already mentions contact admin
  if (messageLower.includes('contact the admin') || messageLower.includes('contact your admin')) {
    return rawMessage;
  }

  // 11. Technical jargon filter (PostgREST, SQL, postgres error codes, JSON syntax)
  const isTechnicalError =
    code.startsWith('23') ||
    code.startsWith('42') ||
    code.startsWith('PGRST') ||
    combined.includes('relation') ||
    combined.includes('syntax error') ||
    combined.includes('schema') ||
    combined.includes('postgrest') ||
    combined.includes('postgresql') ||
    rawMessage.includes('{') ||
    rawMessage.includes('}');

  if (isTechnicalError) {
    return `${fallbackMessage} Please contact the admin if this issue persists.`;
  }

  // 12. Normal clean message fallback
  if (rawMessage.trim()) {
    return `${rawMessage.trim().replace(/\.$/, '')}. Please contact the admin if this issue persists.`;
  }

  return `${fallbackMessage} Please contact the admin.`;
}
