// Export reviewed mappings without reimplementing their JavaScript semantics.
import { logoEntries, logoFor, logoClassFor } from '../web/logos.js';
import { partnerRelationships } from '../web/relationships.js';

process.stdout.write(JSON.stringify({
  logos: logoEntries.map(([name]) => ({ name, url: logoFor(name), className: logoClassFor(name) })),
  relationships: partnerRelationships,
}));
