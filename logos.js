// Only explicitly reviewed names are mapped; no name-to-identity guessing.
const logos = Object.freeze({
  'Amazon Web Services':'aws-color', 'Google Cloud':'googlecloud', 'Google for Startups':'google-color',
  'Microsoft':'microsoft-color', 'Oracle':'oracle', 'OpenAI':'openai', 'Anthropic':'anthropic',
  'xAI':'xai', 'Alibaba Cloud':'alibabacloud', 'NVIDIA':'nvidia-color', 'Together AI':'together',
  'Baseten':'baseten', 'DeepInfra':'deepinfra', 'Modal':'modal', 'Cerebras':'cerebras',
  'Fireworks AI':'fireworks', 'Nebius':'nebius', 'Cognition':'devin', 'GitHub':'github',
  'Vercel':'vercel', 'Replit':'replit',
  'Vercel AI Accelerator':'vercel', 'Vercel Ventures':'vercel', 'Product Hunt':'producthunt',
  'Y Combinator Bookface':'ycombinator'
});
export function logoFor(name) {
  const slug=Object.hasOwn(logos,name)?logos[name]:null;
  return slug ? `./assets/logos/${slug}.svg` : null;
}
export const logoEntries=Object.freeze(Object.entries(logos));
