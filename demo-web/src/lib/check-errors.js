import { MembershipError } from '../../../contract/membership-error.js';

export const ERROR_CODES = Object.freeze({
  LOCAL_MEMBERSHIP_MISSING: 'LOCAL_MEMBERSHIP_MISSING',
  WALLET_REJECTED: 'WALLET_REJECTED',
  NETWORK_FAILURE: 'NETWORK_FAILURE',
  UNKNOWN: 'UNKNOWN',
  PENDING: 'PENDING',
});

export const SAFE_ERROR_MESSAGES = Object.freeze({
  [ERROR_CODES.LOCAL_MEMBERSHIP_MISSING]: 'No saved record matches these local details.',
  [ERROR_CODES.WALLET_REJECTED]: 'The wallet request was declined or did not finish. Review your wallet before retrying.',
  [ERROR_CODES.NETWORK_FAILURE]: 'Reconnect your wallet or network before trying again.',
  [ERROR_CODES.UNKNOWN]: 'The check did not finish. Live requests may be disabled; review wallet activity before retrying.',
  [ERROR_CODES.PENDING]: 'A prior wallet request is still being checked. Wait for its outcome before trying again.',
});

export const SAFE_ERROR_HEADINGS = Object.freeze({
  [ERROR_CODES.LOCAL_MEMBERSHIP_MISSING]: 'NO MATCH',
  [ERROR_CODES.WALLET_REJECTED]: 'Wallet action not completed',
  [ERROR_CODES.NETWORK_FAILURE]: 'Network check unavailable',
  [ERROR_CODES.UNKNOWN]: 'Check unavailable',
  [ERROR_CODES.PENDING]: 'Wallet outcome pending',
});

const BRAND = Symbol('check-error');
const knownCodes = new Set(Object.values(ERROR_CODES));

export class AppError extends Error {
  constructor(code) {
    const safeCode = knownCodes.has(code) ? code : ERROR_CODES.UNKNOWN;
    super(SAFE_ERROR_MESSAGES[safeCode]);
    this.name = 'AppError';
    this.code = safeCode;
    Object.defineProperty(this, BRAND, { value: true });
  }
}

export { AppError as CheckError };

export function createAppError(code) {
  return new AppError(code);
}

export const createCheckError = createAppError;

export function isAppError(value) {
  return value instanceof AppError && value[BRAND] === true && knownCodes.has(value.code);
}

export const isCheckError = isAppError;

export function normalizeCheckError(value) {
  if (isAppError(value)) return value;
  if (value instanceof MembershipError) return createAppError(ERROR_CODES.LOCAL_MEMBERSHIP_MISSING);
  return createAppError(ERROR_CODES.UNKNOWN);
}

export const toSafeCheckError = normalizeCheckError;
