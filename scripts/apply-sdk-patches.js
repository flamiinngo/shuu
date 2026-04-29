/**
 * Apply our @arcium-hq/client SDK fixes directly to node_modules.
 * Run once, then `npx patch-package @arcium-hq/client` to capture the diff
 * into patches/ so the fixes survive `yarn install`.
 *
 * Usage:
 *   node scripts/apply-sdk-patches.js
 */
const fs = require("fs");
const path = require("path");

const targets = [
  "node_modules/@arcium-hq/client/build/index.cjs",
  "node_modules/@arcium-hq/client/build/index.mjs",
];

let totalChanges = 0;

for (const file of targets) {
  if (!fs.existsSync(file)) {
    console.error(`SKIP (file missing): ${file}`);
    continue;
  }
  let src = fs.readFileSync(file, "utf8");
  const before = src;
  let n = 0;

  // Patch 1: lower default chunkSize from 500 -> 15 (Helius free tier safe)
  const chunkRe = /chunkSize = 500, confirmOptions/g;
  if (chunkRe.test(src)) {
    src = src.replace(chunkRe, "chunkSize = 15, confirmOptions");
    n++;
  }

  // Patch 2: defang skip-on-size guard (was finalizing partial uploads as garbage)
  const skipRe = /if \(existingAcc !== null && existingAcc\.data\.length >= requiredAccountSize\) \{/g;
  if (skipRe.test(src)) {
    src = src.replace(
      skipRe,
      "// PATCHED skip-on-size unsafe (partial uploads pass with zero data)\n    if (false && existingAcc !== null && existingAcc.data.length >= requiredAccountSize) {"
    );
    n++;
  }

  if (src === before) {
    console.error(`NO CHANGES applied to ${file}`);
  } else {
    fs.writeFileSync(file, src);
    console.log(`patched ${file} (${n} replacements)`);
    totalChanges += n;
  }
}

console.log(`\nTotal replacements: ${totalChanges}`);
console.log(`\nNext: capture into patches/ via:`);
console.log(`  rm -f patches/@arcium-hq+client+0.9.6.patch`);
console.log(`  npx patch-package @arcium-hq/client`);
