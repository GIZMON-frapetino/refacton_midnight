export const LOCAL_MEMBERSHIP_MISSING = 'LOCAL_MEMBERSHIP_MISSING';
const LEGACY_SAFE_MESSAGE = 'Attestation not found';

export class MembershipError extends Error {
  constructor() {
    super(LEGACY_SAFE_MESSAGE);
    this.name = 'MembershipError';
    this.code = LOCAL_MEMBERSHIP_MISSING;
  }
}

export { MembershipError as MembershipMissingError };
