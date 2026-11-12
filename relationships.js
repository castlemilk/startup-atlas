// Provider claims are sourced; a listing does not establish startup eligibility.
const data={};
function add(names, relationship) {
  for (const name of names) (data[name] ??= []).push(Object.freeze(relationship));
}
add(['Founders Fund','Greylock','Index Ventures','Bessemer','Spark Capital','Bain Capital Ventures','8VC','Menlo Ventures','Lux Capital','Thrive Capital','USV','Paradigm','CRV','Madrona','Kaszek'], {provider:'Vercel',programme:'Vercel for Startups',relationship:'Listed startup partner',source:'https://vercel.com/startups',checked:'2026-11-12'});
add(['a16z','Greylock','Sequoia Capital'], {provider:'AWS',programme:'AWS Activate',relationship:'Listed Activate Provider',source:'https://aws.amazon.com/startups/credits/',checked:'2026-11-12'});
export const partnerRelationships=Object.freeze(data);
