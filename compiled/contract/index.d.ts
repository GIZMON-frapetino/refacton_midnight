import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export type Witnesses<PS> = {
  questId(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  versionNum(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, bigint];
  userSecret(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  localSecretKey(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  saltValue(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  commitmentPath(context: __compactRuntime.WitnessContext<Ledger, PS>,
                 comm_0: Uint8Array): [PS, { leaf: Uint8Array,
                                             path: { sibling: { field: bigint },
                                                     goes_left: boolean
                                                   }[]
                                           }];
  issuerAdminSecret(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  issuerSecret(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  authorizationQuestId(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  authorizationCommitment(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  authorizationNullifier(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
}

export type ImpureCircuits<PS> = {
  registerIssuer(context: __compactRuntime.CircuitContext<PS>, key_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  authorizeRecord(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  recordQuest(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  checkAttestation(context: __compactRuntime.CircuitContext<PS>,
                   challenge_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  hasNullifier(context: __compactRuntime.CircuitContext<PS>, n_0: Uint8Array): __compactRuntime.CircuitResults<PS, boolean>;
  getCounterValue(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, bigint>;
}

export type ProvableCircuits<PS> = {
  registerIssuer(context: __compactRuntime.CircuitContext<PS>, key_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  authorizeRecord(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  recordQuest(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  checkAttestation(context: __compactRuntime.CircuitContext<PS>,
                   challenge_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  hasNullifier(context: __compactRuntime.CircuitContext<PS>, n_0: Uint8Array): __compactRuntime.CircuitResults<PS, boolean>;
  getCounterValue(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, bigint>;
}

export type PureCircuits = {
  deriveAdminKey(secret_0: Uint8Array): Uint8Array;
  deriveIssuerKey(secret_0: Uint8Array): Uint8Array;
}

export type Circuits<PS> = {
  deriveAdminKey(context: __compactRuntime.CircuitContext<PS>,
                 secret_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  deriveIssuerKey(context: __compactRuntime.CircuitContext<PS>,
                  secret_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  registerIssuer(context: __compactRuntime.CircuitContext<PS>, key_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  authorizeRecord(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  recordQuest(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  checkAttestation(context: __compactRuntime.CircuitContext<PS>,
                   challenge_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  hasNullifier(context: __compactRuntime.CircuitContext<PS>, n_0: Uint8Array): __compactRuntime.CircuitResults<PS, boolean>;
  getCounterValue(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, bigint>;
}

export type Ledger = {
  commitments: {
    isFull(): boolean;
    checkRoot(rt_0: { field: bigint }): boolean;
    root(): __compactRuntime.MerkleTreeDigest;
    firstFree(): bigint;
    pathForLeaf(index_0: bigint, leaf_0: Uint8Array): __compactRuntime.MerkleTreePath<Uint8Array>;
    findPathForLeaf(leaf_0: Uint8Array): __compactRuntime.MerkleTreePath<Uint8Array> | undefined
  };
  nullifiers: {
    isEmpty(): boolean;
    size(): bigint;
    member(elem_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<Uint8Array>
  };
  readonly counter: bigint;
  readonly issuerAdmin: Uint8Array;
  readonly authorizationScope: Uint8Array;
  issuerKeys: {
    isEmpty(): boolean;
    size(): bigint;
    member(elem_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<Uint8Array>
  };
  recordAuthorizations: {
    isEmpty(): boolean;
    size(): bigint;
    member(elem_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<Uint8Array>
  };
}

export type ContractReferenceLocations = any;

export declare const contractReferenceLocations : ContractReferenceLocations;

export declare class Contract<PS = any, W extends Witnesses<PS> = Witnesses<PS>> {
  witnesses: W;
  circuits: Circuits<PS>;
  impureCircuits: ImpureCircuits<PS>;
  provableCircuits: ProvableCircuits<PS>;
  constructor(witnesses: W);
  initialState(context: __compactRuntime.ConstructorContext<PS>,
               adminKey_0: Uint8Array,
               scope_0: Uint8Array): __compactRuntime.ConstructorResult<PS>;
}

export declare function ledger(state: __compactRuntime.StateValue | __compactRuntime.ChargedState): Ledger;
export declare const pureCircuits: PureCircuits;
