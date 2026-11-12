// Source-backed provider relationships. A listing does not establish eligibility.
const source='https://vercel.com/startups';
const names=['Founders Fund','Greylock','Index Ventures','Bessemer','Spark Capital','Bain Capital Ventures','8VC','Menlo Ventures','Lux Capital','Thrive Capital'];
export const partnerRelationships=Object.freeze(Object.fromEntries(names.map(name=>[name,[{provider:'Vercel',programme:'Vercel for Startups',relationship:'Listed startup partner',source,checked:'2026-11-12'}]])));
