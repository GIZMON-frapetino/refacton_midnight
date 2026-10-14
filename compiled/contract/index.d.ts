import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export type Witnesses<PS> = {
  questId(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  versionNum(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, bigint];
  userSecret(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  saltValue(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
}

export type ImpureCircuits<PS> = {
  recordQuest(context: __compactRuntime.CircuitContext<PS>,
              nullifierInput_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  checkAttestation(context: __compactRuntime.CircuitContext<PS>,
                   expectedCommitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  hasCommitment(context: __compactRuntime.CircuitContext<PS>, comm_0: Uint8Array): __compactRuntime.CircuitResults<PS, boolean>;
  hasNullifier(context: __compactRuntime.CircuitContext<PS>, n_0: Uint8Array): __compactRuntime.CircuitResults<PS, boolean>;
  getCounterValue(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, bigint>;
}

export type ProvableCircuits<PS> = {
  recordQuest(context: __compactRuntime.CircuitContext<PS>,
              nullifierInput_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  hasCommitment(context: __compactRuntime.CircuitContext<PS>, comm_0: Uint8Array): __compactRuntime.CircuitResults<PS, boolean>;
  hasNullifier(context: __compactRuntime.CircuitContext<PS>, n_0: Uint8Array): __compactRuntime.CircuitResults<PS, boolean>;
  getCounterValue(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, bigint>;
}

export type PureCircuits = {
}

export type Circuits<PS> = {
  recordQuest(context: __compactRuntime.CircuitContext<PS>,
              nullifierInput_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  checkAttestation(context: __compactRuntime.CircuitContext<PS>,
                   expectedCommitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  hasCommitment(context: __compactRuntime.CircuitContext<PS>, comm_0: Uint8Array): __compactRuntime.CircuitResults<PS, boolean>;
  hasNullifier(context: __compactRuntime.CircuitContext<PS>, n_0: Uint8Array): __compactRuntime.CircuitResults<PS, boolean>;
  getCounterValue(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, bigint>;
}

export type Ledger = {
  readonly commitment: Uint8Array;
  readonly nullifier: Uint8Array;
  readonly counter: bigint;
  readonly isSet: boolean;
}

export type ContractReferenceLocations = any;

export declare const contractReferenceLocations : ContractReferenceLocations;

export declare class Contract<PS = any, W extends Witnesses<PS> = Witnesses<PS>> {
  witnesses: W;
  circuits: Circuits<PS>;
  impureCircuits: ImpureCircuits<PS>;
  provableCircuits: ProvableCircuits<PS>;
  constructor(witnesses: W);
  initialState(context: __compactRuntime.ConstructorContext<PS>): __compactRuntime.ConstructorResult<PS>;
}

export declare function ledger(state: __compactRuntime.StateValue | __compactRuntime.ChargedState): Ledger;
export declare const pureCircuits: PureCircuits;
