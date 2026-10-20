export class PreprodSafetyError extends Error {
  constructor(public readonly code: 'DISABLED' | 'RECONNECT' | 'DEPLOYMENT_DISABLED') {
    super(code === 'DISABLED'
      ? 'Live Preprod transactions are disabled. No wallet balance, submission or deployment was started.'
      : code === 'RECONNECT'
        ? 'Wallet connection, network or public key changed. Reconnect Lace and select the contract again.'
        : 'Deployment is disabled: no approved encrypted durable private-state provider is configured.');
    this.name = 'PreprodSafetyError';
  }
}

export async function sendOnPreprod<T>(operation: () => Promise<T>): Promise<T> {
  if (import.meta.env?.VITE_ENABLE_PREPROD_TRANSACTIONS !== 'true') {
    throw new PreprodSafetyError('DISABLED');
  }
  return operation();
}
