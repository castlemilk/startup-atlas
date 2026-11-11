import { cp, mkdir, rm } from 'node:fs/promises';
await rm('dist',{recursive:true,force:true});
await mkdir('dist/data',{recursive:true});
for (const file of ['index.html','styles.css','app.js','logic.js']) await cp(file,`dist/${file}`);
await cp('data/catalogue.json','dist/data/catalogue.json');
console.log('Built static site in dist/');
