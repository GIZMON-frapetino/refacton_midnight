export declare const LOCAL_MEMBERSHIP_MISSING: 'LOCAL_MEMBERSHIP_MISSING';

export declare class MembershipError extends Error {
  readonly code: typeof LOCAL_MEMBERSHIP_MISSING;
  constructor();
}

export { MembershipError as MembershipMissingError };
