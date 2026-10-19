import { pathToFileURL } from 'node:url';

let entries;

export function initialize(data) {
  entries = data;
}

export function resolve(specifier, context, nextResolve) {
  if (Object.hasOwn(entries, specifier)) {
    return { url: pathToFileURL(entries[specifier]).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
