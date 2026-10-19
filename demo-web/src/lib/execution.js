import { recordSession, checkSession } from './session.js';

let mode = 'simulator';
let runner = null;
let inFlight = 0;
export function selectExecutionMode(next, networkRunner = null) {
  if (inFlight) throw new Error('Wait for the current network operation before changing modes or contracts.');
  if (!['simulator', 'preprod'].includes(next)) throw new Error('Unknown execution mode');
  mode = next;
  runner = next === 'preprod' ? networkRunner : null;
}
export function currentExecutionMode() { return mode; }
export function recordInMode(session) {
  if (mode === 'simulator') return recordSession(session);
  if (!runner) throw new Error('Preprod is not ready: connect Lace and supply a deployed contract address. No simulator action was taken.');
  return networkOperation(() => runner.record(session));
}
export function checkInMode(session, questId, challenge, differentSecret = false) {
  if (mode === 'simulator') return checkSession(session, questId, challenge, differentSecret);
  if (!runner) throw new Error('Preprod is not ready: connect Lace and supply a deployed contract address. No simulator check was made.');
  if (session?.network !== 'preprod') throw new Error('A simulator session cannot be checked as a Preprod record.');
  return networkOperation(() => runner.check(session, questId, challenge, differentSecret));
}

function networkOperation(run) {
  if (inFlight) throw new Error('Wait for the current network operation.');
  inFlight++;
  try { return Promise.resolve(run()).finally(() => { inFlight--; }); }
  catch (error) { inFlight--; throw error; }
}
