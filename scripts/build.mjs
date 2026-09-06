import { mkdir, rm, cp, readFile, access, readdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
const root = resolve(import.meta.dirname, ".."), dist = resolve(root, "dist");
async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, {withFileTypes:true})) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path)); else files.push(path);
  }
  return files;
}
for (const file of [...await walk(resolve(root,"src")),resolve(root,"service-worker.js")]) {
  if (!file.endsWith(".js")) continue;
  execFileSync(process.execPath,["--check",file],{stdio:"pipe"});
  const source = await readFile(file,"utf8");
  for (const match of source.matchAll(/from\s+["'](\.[^"']+)["']/g)) await access(resolve(dirname(file), match[1].split("?")[0]));
}
const html = await readFile(resolve(root,"index.html"),"utf8");
for (const match of html.matchAll(/(?:src|href)="\.\/([^"?#]+)/g)) await access(resolve(root,match[1]));
const worker = await readFile(resolve(root,"service-worker.js"),"utf8");
for (const match of worker.matchAll(/"\.\/([^"?#]+)(?:\?[^"#]*)?"/g)) await access(resolve(root,match[1]));
const manifest = JSON.parse(await readFile(resolve(root,"manifest.webmanifest"),"utf8"));
for (const icon of manifest.icons) await access(resolve(root,icon.src));
await rm(dist,{recursive:true,force:true}); await mkdir(dist,{recursive:true});
for (const file of ["index.html","styles.css","manifest.webmanifest","service-worker.js","assets","src"]) await cp(resolve(root,file),resolve(dist,file),{recursive:true});
await writeFile(resolve(dist,".nojekyll"),"");
console.log("Game Center built: JavaScript, imports, manifest and offline assets validated.");
