// Export reviewed mappings without reimplementing their JavaScript semantics.
import { logoEntries, logoFor, logoClassFor } from '../logos.js';
import { partnerRelationships } from '../relationships.js';

process.stdout.write(JSON.stringify({
  logos: logoEntries.map(([name]) => ({ name, url: logoFor(name), className: logoClassFor(name) })),
  relationships: partnerRelationships,
}));
