import type { Witnesses } from '../compiled/contract/index.js';

export interface RecordMaterial {
  questId: Uint8Array;
  version: bigint;
  userSecret: Uint8Array;
  localSecretKey: Uint8Array;
  salt: Uint8Array;
}
export interface AuthorityMaterial {
  adminSecret?: Uint8Array;
  issuerSecret?: Uint8Array;
}
export declare function commitmentFor(material: RecordMaterial): Uint8Array;
export declare function nullifierFor(material: RecordMaterial): Uint8Array;
export declare function authorizationFor(material: RecordMaterial, scope: Uint8Array): Uint8Array;
export declare function recordWitnesses<PS = Record<string, never>>(material: RecordMaterial, authority?: AuthorityMaterial): Witnesses<PS>;
