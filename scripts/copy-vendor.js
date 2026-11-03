import { copyFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vendorGsap = path.join(root, 'public/vendor/gsap');
const vendorThree = path.join(root, 'public/vendor/three');
await mkdir(vendorGsap, { recursive: true });
await mkdir(vendorThree, { recursive: true });
await copyFile(path.join(root, 'node_modules/gsap/dist/gsap.min.js'), path.join(vendorGsap, 'gsap.min.js'));
const threeBuild = path.join(root, 'node_modules/three/build');
const copyThreeDependency = async (file) => {
  const source = path.join(threeBuild, file);
  await copyFile(source, path.join(vendorThree, file));
  const code = await readFile(source, 'utf8');
  const imports = [...code.matchAll(/(?:from\s*|import\s*)['"](\.\.?\/[^'"]+)['"]/g)].map((match) => match[1]);
  for (const specifier of imports) {
    const dependency = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
    if (!dependency.startsWith('../')) await copyThreeDependency(dependency);
  }
};
await copyThreeDependency('three.module.min.js');
