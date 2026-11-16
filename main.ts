// Last Light Quay: the entrypoint (Node 22, standard library only). It hands the
// game in: game/ and screenshots/ are copied from beside this file into the output
// directory, and dossier.json — the summary the judge reads — is written with the
// kit's vendored library, the same one the scorer uses to rebuild it. The program
// is deterministic: two runs write the same bytes.
//
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Play the game locally with: node serve.ts (then open http://localhost:8080).

import { cpSync, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function copyTree(name: string, required: boolean): void {
  const source = join(repoRoot, name);
  if (!existsSync(source)) {
    if (required) throw new Error(`main.ts: missing required directory ${name}/ beside the entrypoint`);
    return;
  }
  if (!statSync(source).isDirectory()) throw new Error(`main.ts: ${name} is not a directory`);
  cpSync(source, join(outDir, name), { recursive: true });
}

mkdirSync(outDir, { recursive: true });
copyTree('game', true);
mkdirSync(join(outDir, 'screenshots'), { recursive: true });
copyTree('screenshots', false);

// The scorer's own caps, as the kit states them: the dossier text is capped at
// 160 KiB, screenshots at 4 files of 256 KiB, game/ at 993 entries and 48 MiB.
// buildDossier refuses an entry the scorer would refuse, so a bad entry fails
// here, loudly, instead of travelling to the server.
const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);
