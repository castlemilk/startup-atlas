// Only explicitly reviewed names are mapped; no name-to-identity guessing.
const logos = Object.freeze({
  'Amazon Web Services':'aws-color', 'Google Cloud':'googlecloud', 'Google for Startups':'google-color',
  'Microsoft':'microsoft-color', 'Oracle':'oracle', 'OpenAI':'openai', 'Anthropic':'anthropic',
  'xAI':'xai', 'Alibaba Cloud':'alibabacloud', 'NVIDIA':'nvidia-color', 'Together AI':'together',
  'Baseten':'baseten', 'DeepInfra':'deepinfra', 'Modal':'modal', 'Cerebras':'cerebras',
  'Fireworks AI':'fireworks', 'Nebius':'nebius', 'Cognition':'devin', 'GitHub':'github',
  'Vercel':'vercel', 'Replit':'replit',
  'Cloudflare':'cloudflare', 'Neon':'neon', 'MongoDB':'mongodb', 'ElevenLabs':'elevenlabs',
  'Deepgram':'deepgram', 'PostHog':'posthog', 'DigitalOcean':'digitalocean', 'Vultr':'vultr', 'Stripe':'stripe',
  'Atlassian':'atlassian', 'Notion':'notion', 'Intercom':'intercom', 'HubSpot':'hubspot',
  'Vercel AI Accelerator':'vercel', 'Vercel Ventures':'vercel', 'Product Hunt':'producthunt',
  'Y Combinator Bookface':'ycombinator',
  "8VC":"8vc",
  "a16z":"a16z.png",
  "Accel":"accel",
  "Bain Capital Ventures":"bain-capital-ventures",
  "Bessemer":"bessemer",
  "CRV":"crv",
  "Founders Fund":"founders-fund.png",
  "General Catalyst":"general-catalyst",
  "Greylock":"greylock",
  "Index Ventures":"index",
  "IVP":"ivp",
  "Khosla":"khosla.png",
  "Kleiner Perkins":"kleiner-perkins.png",
  "Lightspeed":"lightspeed",
  "Lux Capital":"lux.png",
  "Menlo Ventures":"menlo-ventures.png",
  "Sequoia Capital":"sequoia.png",
  "Spark Capital":"spark.png",
  "Blackbird Ventures":"blackbird-ventures",
  "Antler":"antler",
  "Startmate":"startmate",
  "Flybridge":"flybridge",
  "Boxgroup":"boxgroup"
});
export function logoFor(name) {
  const slug=Object.hasOwn(logos,name)?logos[name]:null;
  return slug ? `./assets/logos/${slug.endsWith('.png') ? slug : `${slug}.svg`}` : null;
}
export const logoEntries=Object.freeze(Object.entries(logos));

// White marks use dark tiles; wordmarks need more horizontal space.
const darkTiles = new Set(['8VC','Accel','Bain Capital Ventures','Bessemer','CRV']);
const wideMarks = new Set(['Blackbird Ventures','Antler','Startmate','Flybridge']);
export function logoClassFor(name) {
  return [darkTiles.has(name)?'logo-on-dark':'',wideMarks.has(name)?'logo-wide':''].filter(Boolean).join(' ');
}
