import { cp, mkdir, rm } from 'node:fs/promises';
await rm('dist',{recursive:true,force:true});
await mkdir('dist/data',{recursive:true});
for (const file of ['index.html','styles.css','gamma-components.css','app.js','logic.js','logos.js']) await cp(file,`dist/${file}`);
await cp('data/catalogue.json','dist/data/catalogue.json');
await cp('data/partners-reviewed.json','dist/data/partners-reviewed.json');
await cp('assets/logos','dist/assets/logos',{recursive:true});
console.log('Built static site in dist/');
