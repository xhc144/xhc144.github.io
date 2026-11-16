import fs from 'node:fs';
import {fileURLToPath} from 'node:url';

const filename = fileURLToPath(new URL('../data/publication.json', import.meta.url));
const policy = JSON.parse(fs.readFileSync(filename, 'utf8'));
const allowed = new Set(policy.privateMetadataAllowlist);

// Only explicitly selected metadata may enter the public catalog. This never
// grants access to a repository or authorizes publishing its actual files.
export function mayPublishMetadata(full, repo) {
  if (!repo || typeof repo.private !== 'boolean') return false;
  return repo.private === false || allowed.has(full);
}

export function selectPublishedRepositories(repositories) {
  return Object.fromEntries(Object.entries(repositories)
    .filter(([full, repo]) => mayPublishMetadata(full, repo)));
}
