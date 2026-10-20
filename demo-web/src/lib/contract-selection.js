import { assertPreprodConnection, requireContractAddress } from './wallet-discovery.js';
import { selectExecutionMode, invalidateNetworkRunner, currentSelectionRevision } from './execution.js';

export class ContractSelectionSuperseded extends Error {
  constructor() { super('This contract selection was superseded. The newer selection was left unchanged.'); this.name = 'ContractSelectionSuperseded'; }
}

export async function selectPreprodContract(api, editedAddress, createRunner, onActiveChange, onReconnect) {
  // The in-flight guard runs before removing an existing selection.
  selectExecutionMode('preprod');
  let revision = currentSelectionRevision();
  const isCurrent = () => currentSelectionRevision() === revision;
  onActiveChange(null);
  try {
    const target = requireContractAddress(editedAddress);
    if (!api) throw new Error();
    await assertPreprodConnection(api);
    if (!isCurrent()) throw new ContractSelectionSuperseded();
    const runner = await createRunner(api, target, () => {
      if (!isCurrent()) return;
      invalidateNetworkRunner();
      onActiveChange(null);
      onReconnect();
    });
    if (!isCurrent()) {
      runner.invalidate?.();
      throw new ContractSelectionSuperseded();
    }
    selectExecutionMode('preprod', runner);
    revision = currentSelectionRevision();
    onActiveChange(target);
    return target;
  } catch (error) {
    if (!isCurrent() || error instanceof ContractSelectionSuperseded) throw new ContractSelectionSuperseded();
    invalidateNetworkRunner();
    onActiveChange(null);
    throw new Error('Could not select this contract. Reconnect Lace and check the address, service and circuit assets. Sending remains disabled.');
  }
}
