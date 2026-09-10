import { useEffect, useRef, useState } from 'react';
import { Circle, Loader2, Mic, RotateCcw, Volume2, X } from 'lucide-react';
import { errorMessage } from '../lib/errorMessage';
import { type ActiveRecording, startRecording } from '../lib/recordAudio';
import './RecordBridgeAudioModal.css';

type Phase = 'idle' | 'recording' | 'recorded';

export interface RecordBridgeAudioModalProps {
  /** The bridge word this recording is for, shown for context. */
  headword: string;
  onConfirm: (audio: Blob) => Promise<void>;
  onClose: () => void;
}

export default function RecordBridgeAudioModal({
  headword,
  onConfirm,
  onClose,
}: RecordBridgeAudioModalProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [blob, setBlob] = useState<Blob | null>(null);
  const activeRef = useRef<ActiveRecording | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(
    () => () => {
      activeRef.current?.cancel();
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    },
    [],
  );

  const play = (clip: Blob) => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const url = URL.createObjectURL(clip);
    objectUrlRef.current = url;
    const audio = new Audio(url);
    audioRef.current = audio;
    void audio.play();
  };

  const handleStart = async () => {
    setError(null);
    try {
      activeRef.current = await startRecording();
      setPhase('recording');
    } catch (caught) {
      setError(errorMessage(caught, 'Could not start recording.'));
    }
  };

  const handleStop = async () => {
    if (!activeRef.current) return;
    const recorded = await activeRef.current.stop();
    activeRef.current = null;
    setBlob(recorded);
    setPhase('recorded');
    play(recorded);
  };

  const handleReplay = () => {
    if (blob) play(blob);
  };

  const handleRetry = () => {
    setBlob(null);
    setPhase('idle');
    setError(null);
  };

  const handleConfirm = async () => {
    if (!blob || isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      await onConfirm(blob);
      onClose();
    } catch (caught) {
      setError(errorMessage(caught, 'Could not save this recording.'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    activeRef.current?.cancel();
    onClose();
  };

  return (
    <div className="record-modal__overlay" role="presentation" onClick={handleCancel}>
      <div
        className="record-modal card"
        role="dialog"
        aria-modal="true"
        aria-label={`Record audio for ${headword}`}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="record-modal__close"
          onClick={handleCancel}
          aria-label="Cancel"
        >
          <X size={16} />
        </button>

        <h2 className="record-modal__title">Record: {headword}</h2>

        {error && (
          <p className="notice notice--error" role="alert">
            {error}
          </p>
        )}

        {phase === 'idle' && (
          <button type="button" className="btn btn--lg" onClick={() => void handleStart()}>
            <Mic size={16} /> Start recording
          </button>
        )}

        {phase === 'recording' && (
          <button type="button" className="btn btn--lg btn--negative" onClick={() => void handleStop()}>
            <Circle className="record-modal__pulse" size={14} fill="currentColor" /> Stop
          </button>
        )}

        {phase === 'recorded' && (
          <div className="record-modal__actions">
            <button type="button" className="btn btn--positive" onClick={() => void handleConfirm()} disabled={isSaving}>
              {isSaving && <Loader2 size={15} className="record-modal__spin" />}
              Confirm
            </button>
            <button type="button" className="btn" onClick={handleReplay} disabled={isSaving}>
              <Volume2 size={15} /> Replay
            </button>
            <button type="button" className="btn" onClick={handleRetry} disabled={isSaving}>
              <RotateCcw size={15} /> Retry
            </button>
            <button type="button" className="btn btn--negative" onClick={handleCancel} disabled={isSaving}>
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
