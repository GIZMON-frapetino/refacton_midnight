export declare const ERROR_CODES: Readonly<{
  LOCAL_MEMBERSHIP_MISSING: 'LOCAL_MEMBERSHIP_MISSING';
  WALLET_REJECTED: 'WALLET_REJECTED';
  NETWORK_FAILURE: 'NETWORK_FAILURE';
  UNKNOWN: 'UNKNOWN';
  PENDING: 'PENDING';
}>;

export type CheckErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export declare const SAFE_ERROR_MESSAGES: Readonly<Record<CheckErrorCode, string>>;
export declare const SAFE_ERROR_HEADINGS: Readonly<Record<CheckErrorCode, string>>;

export declare class AppError extends Error {
  readonly code: CheckErrorCode;
  constructor(code: CheckErrorCode);
}

export { AppError as CheckError };
export declare function createAppError(code: CheckErrorCode): AppError;
export declare const createCheckError: typeof createAppError;
export declare function isAppError(value: unknown): value is AppError;
export declare const isCheckError: typeof isAppError;
export declare function normalizeCheckError(value: unknown): AppError;
export declare const toSafeCheckError: typeof normalizeCheckError;
