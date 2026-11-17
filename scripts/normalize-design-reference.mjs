#!/usr/bin/env node
/**
 * Adapt recorded browser observations to a separately installed upstream
 * extract-design-system normalizer and emitter. This script never browses.
 * Third-party source is not bundled; use the pinned checkout described in
 * docs/REFERENCE-EXTRACTION.md and retain its upstream MIT licence.
 */
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const revision = '1873741ba8dea755e35e6e15134f7918cd58e036';
const sourceHashes = {
  'src/normalize/normalize.ts':'d568b547ad5b9ec547c8164dba4543cedb7377b5',
  'src/schemas/normalized.ts':'cf089db70cad1f921e9307aa5d927add571c377f',
  'src/generators/css-vars.ts':'2b6ef77127ba6128216922e0c0a609fc61742cb7',
  'src/commands/write-design-system.ts':'98767a7360f45661a7e0b3aca5bd2e6bc0f7be9f',
  'src/utils/files.ts':'bfcfbf109389f145d249bcb4b223e0965d61541f',
  'src/utils/logger.ts':'60ecd046ba8a0cbe95b2e9a4b01c9326a5e149d5',
  'src/utils/paths.ts':'596d051c38445195de655166fc99f2e2a73ca393',
  'LICENSE':'ed700b3bf67b13902b412aa318e114df82a187ee'
};

const options = {};
for (let i=2;i<process.argv.length;i+=2) {
  const key = process.argv[i];
  const value = process.argv[i+1];
  if (!['--upstream','--input','--output'].includes(key) || !value || value.startsWith('--')) {
    throw new Error('Usage: node scripts/normalize-design-reference.mjs --upstream <pinned-checkout> --input <observations.json> --output <new-directory>');
  }
  options[key.slice(2)] = resolve(value);
}
if (!options.upstream || !options.input || !options.output) throw new Error('Provide --upstream, --input and --output.');
if (options.output === dirname(options.input)) throw new Error('Use a separate output directory to preserve the reviewed input snapshot.');

for (const [name,expected] of Object.entries(sourceHashes)) {
  const bytes = await readFile(resolve(options.upstream,name));
  const actual = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  if (actual !== expected) throw new Error(`Pinned upstream source does not match ${revision}: ${name}`);
}
const upstreamPackage = JSON.parse(await readFile(resolve(options.upstream,'package.json'),'utf8'));
if (upstreamPackage.version !== '0.1.11') throw new Error('Expected extract-design-system v0.1.11.');
const { normalizeExtraction } = await import(pathToFileURL(resolve(options.upstream,'dist/normalize/normalize.js')));
const { writeDesignSystemFiles } = await import(pathToFileURL(resolve(options.upstream,'dist/commands/write-design-system.js')));

const observation = JSON.parse(await readFile(options.input,'utf8'));
if (!observation.url || !observation.extractedAt || !Array.isArray(observation.elements)) throw new Error('Input requires url, extractedAt and elements[].');
const elements = observation.elements;
const strings = values => [...new Set(values.filter(value => typeof value === 'string' && value.trim()))];
const transparent = value => value === 'transparent' || /^rgba\([^)]*,\s*0(?:\.0+)?\s*\)$/.test(value ?? '');
const colorParts = value => typeof value === 'string' ? value.match(/[a-zA-Z-]+\([^)]*\)|#[\da-fA-F]+|[^\s]+/g) ?? [] : [];
const body = elements.find(element => element.tag?.toLowerCase() === 'body');
const html = elements.find(element => element.tag?.toLowerCase() === 'html');
const heading = elements.find(element => element.tag?.toLowerCase() === 'h1') ?? elements.find(element => /^h[1-6]$/.test(element.tag?.toLowerCase() ?? ''));
const mono = elements.find(element => ['code','pre'].includes(element.tag?.toLowerCase()));
const palette = strings(elements.flatMap(element => {
  const style = element.styles ?? {};
  const values = [style.color,style.backgroundColor];
  if (style.borderWidth && !/^0(?:px)?(?:\s+0(?:px)?)*$/.test(style.borderWidth) && style.borderStyle !== 'none') values.push(...colorParts(style.borderColor));
  return values;
})).filter(value => !transparent(value));
const spacingProperties = ['paddingTop','paddingRight','paddingBottom','paddingLeft','marginTop','marginRight','marginBottom','marginLeft','gap','rowGap','columnGap'];
const spacing = strings(elements.flatMap(element => spacingProperties.map(key => element.styles?.[key])))
  .filter(value => !['normal','none','auto','0','0px'].includes(value))
  .sort((a,b) => parseFloat(a)-parseFloat(b) || a.localeCompare(b));
const radii = strings(elements.flatMap(element => {
  const style = element.styles ?? {};
  const corners = ['borderTopLeftRadius','borderTopRightRadius','borderBottomRightRadius','borderBottomLeftRadius'].map(key => style[key]);
  return corners.some(Boolean) ? corners : [style.borderRadius];
})).sort((a,b) => parseFloat(a)-parseFloat(b) || a.localeCompare(b));
const shadows = strings(elements.map(element => element.styles?.boxShadow)).filter(value => value !== 'none');
const background = [body?.styles?.backgroundColor,html?.styles?.backgroundColor].find(value => value && !transparent(value));
const cssVariables = Object.fromEntries(Object.entries(observation.cssVariables ?? {}).filter(([key,value]) => /^--[-_a-zA-Z0-9]+$/.test(key) && typeof value === 'string' && value.trim()));
const raw = {
  url:observation.url,
  extractedAt:observation.extractedAt,
  colors:{...(background ? {background} : {}),...(body?.styles?.color ? {foreground:body.styles.color} : {}),palette,cssVariables},
  typography:{...(heading?.styles?.fontFamily ? {headingFont:heading.styles.fontFamily} : {}),...(body?.styles?.fontFamily ? {bodyFont:body.styles.fontFamily} : {}),...(mono?.styles?.fontFamily ? {monoFont:mono.styles.fontFamily} : {})},
  spacing:{scale:spacing},
  borderRadius:{values:radii},
  shadows:{values:shadows}
};
const normalized = normalizeExtraction(raw,raw.url);
// The upstream schema fixes this literal to dembrandt. Correct collection
// provenance before any result is persisted, and identify the processor apart
// from the collector. Stock `init` is consequently not used by this adapter.
normalized.source = {
  ...normalized.source,
  extractor:'supported-browser-computed-styles',
  normalizer:{
    name:'extract-design-system',
    version:'0.1.11',
    revision,
    adaptation:'Unchanged upstream normalization; collection provenance corrected before persistence.'
  }
};
const staging = await mkdtemp(resolve(tmpdir(),'atlas-reference-tokens-'));
try {
  await writeDesignSystemFiles(normalized,staging);
  await mkdir(options.output,{recursive:true});
  await copyFile(options.input,resolve(options.output,'observations.json'));
  await copyFile(resolve(staging,'design-system/tokens.json'),resolve(options.output,'tokens.json'));
  await copyFile(resolve(staging,'design-system/tokens.css'),resolve(options.output,'tokens.css'));
} finally {
  await rm(staging,{recursive:true,force:true});
}
console.log(`Wrote ${elements.length} observed elements and reference starter files to ${options.output}. Atlas styling was not imported or changed.`);
