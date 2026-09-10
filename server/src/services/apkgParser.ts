import path from 'node:path';
import { createRequire } from 'node:module';
import AdmZip from 'adm-zip';
import initSqlJs from 'sql.js';
import { stripAnkiHtml } from '../lib/stripAnkiHtml.js';

const require = createRequire(import.meta.url);

type SqlJsStatic = Awaited<ReturnType<typeof initSqlJs>>;
type Database = InstanceType<SqlJsStatic['Database']>;

export interface ApkgMediaFile {
  /** Original filename, e.g. "recording.mp3". */
  filename: string;
  /** Best-effort MIME type guessed from the file extension. */
  mime: string;
  bytes: Buffer;
}

export interface ApkgNote {
  /** Keyed by the notetype's field NAME, HTML-stripped. */
  fields: Record<string, string>;
  /**
   * Keyed by field NAME. Every [sound:...] reference found in that field's raw
   * (pre-strip) HTML, resolved to actual bytes via the media manifest. A field with
   * no sound reference is absent from this map (not an empty array).
   */
  media: Record<string, ApkgMediaFile[]>;
}

export interface ParsedApkg {
  /** Name of the notetype used by the largest group of notes in the deck. */
  noteType: string;
  /** Field names in display order (by `ord`), from that notetype's `flds`. */
  fieldNames: string[];
  notes: ApkgNote[];
  /** Count of notes belonging to OTHER notetypes, not included in `notes`. */
  skippedNoteTypeCount: number;
}

export class ApkgParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApkgParseError';
  }
}

const MIME_BY_EXTENSION: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
};

function guessMime(filename: string): string {
  const ext = path.extname(filename).slice(1).toLowerCase();
  return MIME_BY_EXTENSION[ext] ?? 'application/octet-stream';
}

interface AnkiModelField {
  name: string;
  ord: number;
}

interface AnkiModel {
  name: string;
  flds: AnkiModelField[];
}

let sqlJsPromise: Promise<SqlJsStatic> | null = null;

/** Lazily initialize sql.js, pointing it at the .wasm file shipped next to sql-wasm.js. */
function loadSqlJs(): Promise<SqlJsStatic> {
  if (!sqlJsPromise) {
    const sqlWasmDir = path.dirname(require.resolve('sql.js/dist/sql-wasm.js'));
    sqlJsPromise = initSqlJs({
      locateFile: (file: string) => path.join(sqlWasmDir, file),
    });
  }
  return sqlJsPromise;
}

function execToRows(db: Database, sql: string): Record<string, unknown>[] {
  const result = db.exec(sql);
  if (result.length === 0 || !result[0]) return [];
  const { columns, values } = result[0];
  return values.map((row) => {
    const obj: Record<string, unknown> = {};
    columns.forEach((col, i) => {
      obj[col] = row[i];
    });
    return obj;
  });
}

/**
 * Anki's media manifest maps a numeric zip-entry name to the original filename.
 * Older exports store the value as a plain string; some newer exports store an
 * object with a `name` property instead. Support both.
 */
function parseMediaManifest(raw: string): Record<string, string> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== 'object') return {};

  const manifest: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value === 'string') {
      manifest[key] = value;
    } else if (value && typeof value === 'object' && typeof (value as { name?: unknown }).name === 'string') {
      manifest[key] = (value as { name: string }).name;
    }
  }
  return manifest;
}

export async function parseApkg(buffer: Buffer): Promise<ParsedApkg> {
  let zip: AdmZip;
  try {
    zip = new AdmZip(buffer);
    // Force parsing of the central directory now, so a corrupt/non-zip buffer
    // surfaces as an error here rather than partway through the function below.
    zip.getEntries();
  } catch {
    throw new ApkgParseError('This file is not a valid .apkg (zip) archive.');
  }

  const collectionEntry = zip.getEntry('collection.anki21') ?? zip.getEntry('collection.anki2');
  if (!collectionEntry) {
    if (zip.getEntry('collection.anki21b')) {
      throw new ApkgParseError(
        'This .apkg uses a newer compressed format that isn\'t supported yet -- in Anki, use File > Export... and choose "Support older Anki versions" (legacy .apkg) before uploading.',
      );
    }
    throw new ApkgParseError('No Anki collection database found in this file.');
  }

  let sqliteBuffer: Buffer;
  try {
    sqliteBuffer = collectionEntry.getData();
  } catch {
    throw new ApkgParseError('Could not read the Anki collection database from this file.');
  }

  const SQL = await loadSqlJs();

  let db: Database;
  try {
    db = new SQL.Database(new Uint8Array(sqliteBuffer));
  } catch {
    throw new ApkgParseError('The Anki collection database in this file is corrupt or unreadable.');
  }

  let models: Record<string, AnkiModel>;
  let noteRows: Record<string, unknown>[];
  try {
    const colRows = execToRows(db, 'SELECT models FROM col LIMIT 1');
    if (colRows.length === 0 || typeof colRows[0]?.models !== 'string') {
      throw new ApkgParseError('The Anki collection database in this file has no notetype metadata.');
    }
    try {
      models = JSON.parse(colRows[0].models) as Record<string, AnkiModel>;
    } catch {
      throw new ApkgParseError('The Anki collection database in this file has malformed notetype metadata.');
    }

    noteRows = execToRows(db, 'SELECT id, mid, flds FROM notes');
  } catch (err) {
    if (err instanceof ApkgParseError) throw err;
    throw new ApkgParseError('The Anki collection database in this file is corrupt or unreadable.');
  } finally {
    db.close();
  }

  // Group notes by notetype (mid), then pick the notetype with the most notes.
  const notesByMid = new Map<string, Record<string, unknown>[]>();
  for (const row of noteRows) {
    const mid = String(row.mid);
    const list = notesByMid.get(mid);
    if (list) {
      list.push(row);
    } else {
      notesByMid.set(mid, [row]);
    }
  }

  let chosenMid: string | null = null;
  let chosenCount = -1;
  for (const [mid, rows] of notesByMid) {
    if (rows.length > chosenCount) {
      chosenMid = mid;
      chosenCount = rows.length;
    }
  }

  if (chosenMid === null) {
    return { noteType: '', fieldNames: [], notes: [], skippedNoteTypeCount: 0 };
  }

  const chosenModel = models[chosenMid];
  if (!chosenModel || !Array.isArray(chosenModel.flds)) {
    throw new ApkgParseError('The Anki collection database in this file references an unknown notetype.');
  }

  const fieldNames = [...chosenModel.flds].sort((a, b) => a.ord - b.ord).map((f) => f.name);

  let skippedNoteTypeCount = 0;
  for (const [mid, rows] of notesByMid) {
    if (mid !== chosenMid) skippedNoteTypeCount += rows.length;
  }

  // Media manifest: numeric zip-entry name -> original filename. Anki stores the
  // actual media bytes at the zip root under their numeric name (no "media/" prefix).
  const mediaEntry = zip.getEntry('media');
  let filenameToKey = new Map<string, string>();
  if (mediaEntry) {
    try {
      const manifest = parseMediaManifest(mediaEntry.getData().toString('utf-8'));
      filenameToKey = new Map(Object.entries(manifest).map(([key, filename]) => [filename, key]));
    } catch {
      filenameToKey = new Map();
    }
  }

  const chosenRows = notesByMid.get(chosenMid) ?? [];
  const notes: ApkgNote[] = chosenRows.map((row) => {
    const rawValues = String(row.flds ?? '').split('\x1f');
    const fields: Record<string, string> = {};
    const media: Record<string, ApkgMediaFile[]> = {};

    fieldNames.forEach((name, i) => {
      const rawValue = rawValues[i] ?? '';
      fields[name] = stripAnkiHtml(rawValue);

      const soundFiles: ApkgMediaFile[] = [];
      for (const match of rawValue.matchAll(/\[sound:([^\]]+)\]/g)) {
        const soundFilename = match[1];
        if (!soundFilename) continue;
        const zipKey = filenameToKey.get(soundFilename);
        if (zipKey === undefined) continue;
        const mediaZipEntry = zip.getEntry(zipKey);
        if (!mediaZipEntry) continue;
        try {
          soundFiles.push({
            filename: soundFilename,
            mime: guessMime(soundFilename),
            bytes: mediaZipEntry.getData(),
          });
        } catch {
          // Skip media entries that fail to decompress rather than failing the whole parse.
        }
      }
      if (soundFiles.length > 0) {
        media[name] = soundFiles;
      }
    });

    return { fields, media };
  });

  return {
    noteType: chosenModel.name,
    fieldNames,
    notes,
    skippedNoteTypeCount,
  };
}
