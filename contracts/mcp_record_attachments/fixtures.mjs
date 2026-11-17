// All subjects, commits and evidence below are synthetic. No image bytes,
// credentials, permission correspondence, real approval or network I/O exist.
import { recordRevision } from '../../backend/hosted/src/startup-edit.mjs';
import { ATTACHMENT_CONTRACT_VERSION } from './reference-model.mjs';

export async function attachmentFixture(role = 'portrait', mode = 'hosted') {
  const record = {name:'Example', source:'https://example.invalid/about', reviewed_at:'2026-01-01',
    description:'Synthetic source record', founders:[
      {name:'Alex Chen', source:'https://example.invalid/team/alex'},
      {name:'Sam Rao', source:'https://example.invalid/team/sam'},
    ]};
  const head = mode === 'hosted' ? 'a'.repeat(40) : 'b'.repeat(64);
  const context = {mode, head, expectedRevision:head, now:'2026-01-10T00:00:00.000Z',
    research:{reviewed:'2026-01-01', startups:[record]}, graph:{entities:[
      {id:'startup:example', name:'Example', kind:'startup'},
      {id:'person:alex-chen', name:'Alex Chen', kind:'person'},
      {id:'person:sam-rao', name:'Sam Rao', kind:'person'},
    ], edges:[{from:'person:alex-chen', to:'startup:example', kind:'founded'},
      {from:'person:sam-rao', to:'startup:example', kind:'founded'}]}};
  const intent = {contractVersion:ATTACHMENT_CONTRACT_VERSION,
    target:{recordId:'startup:example', expectedRecordRevision:await recordRevision('startup:example', record),
      subjectId:role === 'logo' ? 'startup:example' : 'person:alex-chen', role,
      locator:role === 'logo' ? {kind:'startup'} : {kind:'founder', name:'Alex Chen'}},
    asset:{repository:'castlemilk/startup-atlas', commit:'c'.repeat(40),
      assetId:`asset:sha256:${'d'.repeat(64)}`, manifestRevision:`sha256:${'e'.repeat(64)}`}};
  const calls = [];
  const dependencies = {
    resolveAsset:async binding => { calls.push({kind:'resolveAsset', binding}); return {verified:true, ...binding}; },
    verifyApproval:async request => {
      calls.push({kind:'verifyApproval', request});
      return {verified:true, authorization:'authenticated', status:'approved',
        principal:'synthetic-reviewer', policyRevision:'synthetic-unselected-policy', decisionId:'synthetic-decision',
        intentDigest:request.intentDigest, uses:[...request.uses], revoked:false,
        notBefore:'2026-01-01T00:00:00.000Z', expiresAt:'2026-02-01T00:00:00.000Z'};
    },
  };
  return {intent, context, dependencies, calls};
}
