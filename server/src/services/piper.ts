import { spawn } from 'node:child_process';
import { access, constants, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { config } from '../config.js';

/** Filename prefixes Piper voice packages use for each short language code. */
const MODEL_PREFIXES: Record<string, string[]> = {
  de: ['de_DE'],
  nl: ['nl_NL', 'nl_BE'],
  da: ['da_DK'],
  no: ['nb_NO', 'no_NO'],
  sv: ['sv_SE'],
  it: ['it_IT'],
  es: ['es_ES', 'es_MX'],
  fr: ['fr_FR'],
  pt: ['pt_PT', 'pt_BR'],
  ro: ['ro_RO'],
  ca: ['ca_ES'],
  fi: ['fi_FI'],
};

/** Prefer medium quality; otherwise a stable alphabetical pick. */
const QUALITY_RANK = ['medium', 'high', 'low'] as const;

export function isLocalTtsAvailable(): boolean {
  return Boolean(config.piperBin && config.piperVoicesDir);
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * True when the Piper binary and voices directory exist on disk.
 * Config paths alone are not enough — a missing install must report unavailable.
 */
export async function probeLocalTtsAvailable(): Promise<boolean> {
  if (!isLocalTtsAvailable()) return false;
  const bin = config.piperBin;
  const dir = config.piperVoicesDir;
  if (!(await pathExists(bin)) || !(await pathExists(dir))) return false;

  try {
    const entries = await readdir(dir);
    return entries.some((name) => name.endsWith('.onnx'));
  } catch {
    return false;
  }
}

function qualityRank(filename: string): number {
  const stem = filename.replace(/\.onnx$/i, '');
  for (let i = 0; i < QUALITY_RANK.length; i += 1) {
    if (stem.endsWith(`-${QUALITY_RANK[i]}`)) return i;
  }
  return QUALITY_RANK.length;
}

/** Pick one ONNX voice for the language; order is stable across runs. */
export function pickPiperOnnxFile(entries: string[], preferredLang: string): string | null {
  const prefixes = MODEL_PREFIXES[preferredLang] ?? [];
  const onnx = entries.filter((name) => name.endsWith('.onnx'));
  const withConfig = new Set(
    entries.filter((name) => name.endsWith('.onnx.json')).map((name) => name.slice(0, -'.json'.length)),
  );

  for (const prefix of prefixes) {
    const matches = onnx
      .filter((name) => name.startsWith(prefix))
      // Prefer voices that shipped with a sidecar config (normal Piper packages).
      .filter((name) => withConfig.size === 0 || withConfig.has(name))
      .sort((a, b) => {
        const quality = qualityRank(a) - qualityRank(b);
        if (quality !== 0) return quality;
        return a.localeCompare(b);
      });
    if (matches[0]) return matches[0];
  }
  return null;
}

export async function resolvePiperModel(preferredLang: string): Promise<string | null> {
  const dir = config.piperVoicesDir;
  if (!dir || !(await pathExists(dir))) return null;

  const entries = await readdir(dir);
  const match = pickPiperOnnxFile(entries, preferredLang);
  return match ? path.join(dir, match) : null;
}

function piperEspeakDataDir(bin: string): string | null {
  const candidate = path.join(path.dirname(bin), 'espeak-ng-data');
  return candidate;
}

/** Orthographic text only — strip IPA marks that confuse espeak G2P if they leak in. */
export function sanitizePiperText(text: string): string {
  return text
    .normalize('NFC')
    .replace(/[\u0250-\u02AF\u1D00-\u1D7F\u2070-\u209F\u02B0-\u02FF\u0300-\u036Fˈˌː.]+/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function synthesizeWithPiper(text: string, preferredLang: string): Promise<Buffer> {
  const bin = config.piperBin;
  if (!bin) throw new Error('Piper is not configured');

  const spoken = sanitizePiperText(text);
  if (!spoken) throw new Error('Nothing to synthesize');

  const model = await resolvePiperModel(preferredLang);
  if (!model) {
    throw new Error(`No Piper voice model found for language '${preferredLang}'`);
  }

  const dir = await mkdtemp(path.join(tmpdir(), 'cb-piper-'));
  const outFile = path.join(dir, 'out.wav');
  const espeakData = piperEspeakDataDir(bin);

  const args = [
    '--model',
    model,
    '--output_file',
    outFile,
    // Defaults (0.667 / 0.8) make each run sound different — zero them for stable replay.
    '--noise_scale',
    '0',
    '--noise_w',
    '0',
    // A little trailing silence avoids clipping the last phoneme in the player.
    '--sentence_silence',
    '0.25',
    '-q',
  ];
  if (espeakData && (await pathExists(espeakData))) {
    args.push('--espeak_data', espeakData);
  }

  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(bin, args, {
        stdio: ['pipe', 'ignore', 'pipe'],
        // Load DLLs / relative assets from next to piper.exe on Windows.
        cwd: path.dirname(bin),
      });

      let stderr = '';
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Piper exited with code ${code}${stderr ? `: ${stderr.trim()}` : ''}`));
      });

      // Piper reads stdin line-by-line; without a trailing newline it often truncates.
      child.stdin.write(`${spoken}\n`);
      child.stdin.end();
    });

    return await readFile(outFile);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
