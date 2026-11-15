import { mkdir, copyFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = resolve(root, "dist");
const assets = ["admindashboard.html", "casher.html", "clerk.html", "project.js", "style.css"];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const asset of assets) await copyFile(resolve(root, asset), resolve(output, asset));
await mkdir(resolve(output, "fonts"), { recursive: true });
await copyFile(resolve(root, "node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2"), resolve(output, "fonts/inter-latin-wght-normal.woff2"));
await copyFile(resolve(root, "node_modules/@fontsource-variable/inter/LICENSE"), resolve(output, "fonts/OFL.txt"));
await copyFile(resolve(root, "admindashboard.html"), resolve(output, "index.html"));
await copyFile(resolve(root, "casher.html"), resolve(output, "cashier.html"));
console.log(`Built frontend assets in ${output}`);
