import path from 'node:path';
import { createRequire } from 'node:module';
import AdmZip from 'adm-zip';
import initSqlJs from 'sql.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { ApkgParseError, parseApkg } from './apkgParser.js';

const require = createRequire(import.meta.url);

type SqlJsStatic = Awaited<ReturnType<typeof initSqlJs>>;

let SQL: SqlJsStatic;

beforeAll(async () => {
  const sqlWasmDir = path.dirname(require.resolve('sql.js/dist/sql-wasm.js'));
  SQL = await initSqlJs({ locateFile: (file: string) => path.join(sqlWasmDir, file) });
});

// --- Fixture helpers -------------------------------------------------------
// There's no real .apkg in this repo, so we build one from scratch: a real
// SQLite byte buffer (via sql.js) matching Anki's col/notes table shapes,
// zipped up (via adm-zip's write API) with an optional media manifest.

interface FixtureModel {
  mid: string;
  name: string;
  fields: { name: string; ord: number }[];
}

interface FixtureNote {
  mid: string;
  fieldValues: string[];
}

/** Builds a real SQLite database buffer with `col` and `notes` tables shaped like Anki's. */
function buildCollectionDb(models: FixtureModel[], notes: FixtureNote[]): Buffer {
  const db = new SQL.Database();
  db.run('CREATE TABLE col (id INTEGER PRIMARY KEY, models TEXT)');
  db.run('CREATE TABLE notes (id INTEGER PRIMARY KEY, mid INTEGER, flds TEXT)');

  const modelsJson: Record<string, unknown> = {};
  for (const model of models) {
    modelsJson[model.mid] = {
      name: model.name,
      flds: model.fields.map((f) => ({ name: f.name, ord: f.ord })),
    };
  }
  db.run('INSERT INTO col (id, models) VALUES (1, ?)', [JSON.stringify(modelsJson)]);

  notes.forEach((note, i) => {
    db.run('INSERT INTO notes (id, mid, flds) VALUES (?, ?, ?)', [
      i + 1,
      Number(note.mid),
      note.fieldValues.join('\x1f'),
    ]);
  });

  const bytes = db.export();
  db.close();
  return Buffer.from(bytes);
}

interface FixtureMediaFile {
  /** The numeric key used as the zip entry name, e.g. "0". */
  key: string;
  filename: string;
  bytes: Buffer;
}

function buildApkgZip(options: {
  collectionEntryName?: string;
  dbBuffer?: Buffer;
  media?: FixtureMediaFile[];
  extraEntries?: { name: string; bytes: Buffer }[];
}): Buffer {
  const zip = new AdmZip();
  if (options.dbBuffer && options.collectionEntryName) {
    zip.addFile(options.collectionEntryName, options.dbBuffer);
  }
  if (options.media) {
    const manifest: Record<string, string> = {};
    for (const m of options.media) {
      manifest[m.key] = m.filename;
      zip.addFile(m.key, m.bytes);
    }
    zip.addFile('media', Buffer.from(JSON.stringify(manifest), 'utf-8'));
  }
  for (const extra of options.extraEntries ?? []) {
    zip.addFile(extra.name, extra.bytes);
  }
  return zip.toBuffer();
}

// --- sql.js environment sanity check ---------------------------------------

describe('sql.js environment', () => {
  it('actually loads the wasm binary and round-trips a real SQLite database', () => {
    const db = new SQL.Database();
    db.run('CREATE TABLE t (id INTEGER, name TEXT)');
    db.run('INSERT INTO t (id, name) VALUES (?, ?)', [1, 'hello']);
    db.run('INSERT INTO t (id, name) VALUES (?, ?)', [2, 'world']);

    const exported = db.export();
    db.close();
    expect(exported.byteLength).toBeGreaterThan(0);

    // Reload from the exported bytes to prove it's a genuine, readable SQLite file.
    const reloaded = new SQL.Database(exported);
    const result = reloaded.exec('SELECT id, name FROM t ORDER BY id');
    reloaded.close();

    expect(result).toHaveLength(1);
    expect(result[0]?.columns).toEqual(['id', 'name']);
    expect(result[0]?.values).toEqual([
      [1, 'hello'],
      [2, 'world'],
    ]);
  });
});

// --- parseApkg ---------------------------------------------------------------

describe('parseApkg', () => {
  it('parses a single-notetype deck with fields including one with a sound reference', async () => {
    const dbBuffer = buildCollectionDb(
      [
        {
          mid: '1',
          name: 'Basic',
          fields: [
            { name: 'Front', ord: 0 },
            { name: 'Back', ord: 1 },
          ],
        },
      ],
      [
        { mid: '1', fieldValues: ['Hello', '<b>Hallo</b> [sound:hallo.mp3]'] },
        { mid: '1', fieldValues: ['World', 'Welt'] },
      ],
    );
    const zipBuffer = buildApkgZip({
      collectionEntryName: 'collection.anki21',
      dbBuffer,
      media: [{ key: '0', filename: 'hallo.mp3', bytes: Buffer.from('fake-mp3-bytes') }],
    });

    const parsed = await parseApkg(zipBuffer);

    expect(parsed.noteType).toBe('Basic');
    expect(parsed.fieldNames).toEqual(['Front', 'Back']);
    expect(parsed.skippedNoteTypeCount).toBe(0);
    expect(parsed.notes).toHaveLength(2);

    expect(parsed.notes[0]?.fields).toEqual({ Front: 'Hello', Back: 'Hallo' });
    expect(parsed.notes[0]?.media.Front).toBeUndefined();
    expect(parsed.notes[0]?.media.Back).toHaveLength(1);
    expect(parsed.notes[0]?.media.Back?.[0]).toEqual({
      filename: 'hallo.mp3',
      mime: 'audio/mpeg',
      bytes: Buffer.from('fake-mp3-bytes'),
    });

    expect(parsed.notes[1]?.fields).toEqual({ Front: 'World', Back: 'Welt' });
    expect(parsed.notes[1]?.media).toEqual({});
  });

  it('picks the notetype with the most notes and reports the skipped count', async () => {
    const dbBuffer = buildCollectionDb(
      [
        {
          mid: '1',
          name: 'Basic',
          fields: [
            { name: 'Front', ord: 0 },
            { name: 'Back', ord: 1 },
          ],
        },
        {
          mid: '2',
          name: 'Cloze',
          fields: [
            { name: 'Text', ord: 0 },
            { name: 'Extra', ord: 1 },
          ],
        },
      ],
      [
        { mid: '1', fieldValues: ['A1', 'B1'] },
        { mid: '1', fieldValues: ['A2', 'B2'] },
        { mid: '1', fieldValues: ['A3', 'B3'] },
        { mid: '2', fieldValues: ['{{c1::foo}}', 'extra'] },
      ],
    );
    const zipBuffer = buildApkgZip({ collectionEntryName: 'collection.anki21', dbBuffer });

    const parsed = await parseApkg(zipBuffer);

    expect(parsed.noteType).toBe('Basic');
    expect(parsed.fieldNames).toEqual(['Front', 'Back']);
    expect(parsed.notes).toHaveLength(3);
    expect(parsed.skippedNoteTypeCount).toBe(1);
  });

  it('handles a deck with no media manifest at all', async () => {
    const dbBuffer = buildCollectionDb(
      [
        {
          mid: '1',
          name: 'Basic',
          fields: [
            { name: 'Front', ord: 0 },
            { name: 'Back', ord: 1 },
          ],
        },
      ],
      [{ mid: '1', fieldValues: ['Hi [sound:missing.mp3]', 'there'] }],
    );
    // No `media` manifest entry in the zip at all.
    const zipBuffer = buildApkgZip({ collectionEntryName: 'collection.anki21', dbBuffer });

    const parsed = await parseApkg(zipBuffer);

    expect(parsed.notes).toHaveLength(1);
    expect(parsed.notes[0]?.fields.Front).toBe('Hi');
    expect(parsed.notes[0]?.media).toEqual({});
  });

  it('throws a specific error for the unsupported .anki21b compressed format', async () => {
    const zipBuffer = buildApkgZip({
      extraEntries: [{ name: 'collection.anki21b', bytes: Buffer.from('zstd-compressed-not-really') }],
    });

    await expect(parseApkg(zipBuffer)).rejects.toThrow(ApkgParseError);
    await expect(parseApkg(zipBuffer)).rejects.toThrow(/newer compressed format/i);
  });

  it('throws ApkgParseError (not a raw crash) for a completely invalid or empty zip', async () => {
    // Valid zip, but no entries at all.
    const emptyZip = new AdmZip().toBuffer();
    await expect(parseApkg(emptyZip)).rejects.toThrow(ApkgParseError);

    // Not a zip file at all.
    const garbage = Buffer.from('this is definitely not a zip file');
    await expect(parseApkg(garbage)).rejects.toThrow(ApkgParseError);
  });
});
