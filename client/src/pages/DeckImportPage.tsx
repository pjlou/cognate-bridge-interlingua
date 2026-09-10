import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Loader2, Upload } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAsync } from '../hooks/useAsync';
import { errorMessage } from '../lib/errorMessage';
import {
  confirmDeckMapping,
  getTargetLanguages,
  importApkg,
  type ApkgImportPreview,
  type TargetLanguage,
} from '../services/api';
import './DeckImportPage.css';

const NONE = '__none__';

export default function DeckImportPage() {
  const navigate = useNavigate();
  const { data: targetLanguages } = useAsync(getTargetLanguages);

  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ApkgImportPreview | null>(null);

  const [targetCode, setTargetCode] = useState('');
  const [englishText, setEnglishText] = useState('');
  const [englishAudio, setEnglishAudio] = useState(NONE);
  const [targetText, setTargetText] = useState('');
  const [targetAudio, setTargetAudio] = useState(NONE);
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    setFile(event.target.files?.[0] ?? null);
  };

  const handleUpload = async (event: FormEvent) => {
    event.preventDefault();
    if (!file || isUploading) return;

    setIsUploading(true);
    setUploadError(null);
    try {
      const result = await importApkg(file);
      setPreview(result);
      setEnglishText(result.fieldNames[0] ?? '');
      setTargetText(result.fieldNames[1] ?? result.fieldNames[0] ?? '');
    } catch (caught) {
      setUploadError(errorMessage(caught, 'Could not read that .apkg file.'));
    } finally {
      setIsUploading(false);
    }
  };

  const handleConfirm = async (event: FormEvent) => {
    event.preventDefault();
    if (!preview || !targetCode || !englishText || !targetText || isConfirming) return;

    setIsConfirming(true);
    setConfirmError(null);
    try {
      await confirmDeckMapping(preview.deckId, 'ia', targetCode, {
        englishText,
        englishAudio: englishAudio === NONE ? null : englishAudio,
        targetText,
        targetAudio: targetAudio === NONE ? null : targetAudio,
      });
      navigate(`/decks/${preview.deckId}`);
    } catch (caught) {
      setConfirmError(errorMessage(caught, 'Could not save this field mapping.'));
      setIsConfirming(false);
    }
  };

  const sample = preview?.sampleRows[0] ?? null;

  return (
    <main className="page">
      <header className="page__header">
        <h1 className="page__title">Import an Anki deck</h1>
        <p className="page__lede">
          Upload a <code>.apkg</code> export, and tell us which of its fields hold
          English text/audio and target-language text/audio. There's no Interlingua
          translation engine in this build (see <Link to="/translate">Translate</Link>),
          so the deck stays untranslated, but you can still organize it here and
          download it back into Anki.
        </p>
      </header>

      {!preview && (
        <form className="deck-import stack" onSubmit={(event) => void handleUpload(event)}>
          <div className="field">
            <label htmlFor="apkg-file">Anki deck file (.apkg)</label>
            <input id="apkg-file" type="file" accept=".apkg" onChange={handleFileChange} />
          </div>
          <button type="submit" className="btn deck-import__button" disabled={!file || isUploading}>
            {isUploading ? <Loader2 size={16} className="deck-import__spin" /> : <Upload size={16} />}
            {isUploading ? 'Reading deck…' : 'Upload'}
          </button>
          {uploadError && (
            <p className="notice notice--error" role="alert">
              {uploadError}
            </p>
          )}
        </form>
      )}

      {preview && (
        <form className="deck-import stack" onSubmit={(event) => void handleConfirm(event)}>
          <p className="notice notice--info">
            Found {preview.noteCount} card{preview.noteCount === 1 ? '' : 's'} using the "
            {preview.noteType}" note type.
            {preview.mediaWarning ? ` ${preview.mediaWarning}` : ''}
          </p>

          <div className="deck-import__row">
            <div className="field">
              <label htmlFor="deck-target">Target language</label>
              <select
                id="deck-target"
                value={targetCode}
                onChange={(event) => setTargetCode(event.target.value)}
              >
                <option value="">Choose one…</option>
                {(targetLanguages ?? []).map((target: TargetLanguage) => (
                  <option key={target.code} value={target.code}>
                    {target.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="deck-import__row">
            <div className="field">
              <label htmlFor="field-english-text">English written</label>
              <select
                id="field-english-text"
                value={englishText}
                onChange={(event) => setEnglishText(event.target.value)}
              >
                {preview.fieldNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              {sample && <p className="deck-import__sample">{sample[englishText]}</p>}
            </div>
            <div className="field">
              <label htmlFor="field-english-audio">English audio</label>
              <select
                id="field-english-audio"
                value={englishAudio}
                onChange={(event) => setEnglishAudio(event.target.value)}
              >
                <option value={NONE}>None</option>
                {preview.fieldNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="deck-import__row">
            <div className="field">
              <label htmlFor="field-target-text">Target-language written</label>
              <select
                id="field-target-text"
                value={targetText}
                onChange={(event) => setTargetText(event.target.value)}
              >
                {preview.fieldNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              {sample && <p className="deck-import__sample">{sample[targetText]}</p>}
            </div>
            <div className="field">
              <label htmlFor="field-target-audio">Target-language audio</label>
              <select
                id="field-target-audio"
                value={targetAudio}
                onChange={(event) => setTargetAudio(event.target.value)}
              >
                <option value={NONE}>None</option>
                {preview.fieldNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            type="submit"
            className="btn deck-import__button"
            disabled={!targetCode || !englishText || !targetText || isConfirming}
          >
            {isConfirming && <Loader2 size={16} className="deck-import__spin" />}
            {isConfirming ? 'Saving…' : 'Confirm mapping'}
          </button>
          {confirmError && (
            <p className="notice notice--error" role="alert">
              {confirmError}
            </p>
          )}
        </form>
      )}
    </main>
  );
}
