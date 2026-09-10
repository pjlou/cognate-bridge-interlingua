/** Thin wrapper around `getUserMedia`/`MediaRecorder` for the in-study recording flow. */

export class RecordingPermissionError extends Error {}

export interface ActiveRecording {
  /** Stops recording and resolves with the captured audio. */
  stop: () => Promise<Blob>;
  /** Stops recording and releases the microphone without keeping the audio. */
  cancel: () => void;
}

const CANDIDATE_MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return undefined;
  }
  return CANDIDATE_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
}

export async function startRecording(): Promise<ActiveRecording> {
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    throw new RecordingPermissionError(
      'Microphone access was denied. Allow microphone access in your browser to record audio.',
    );
  }

  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };

  function releaseTracks() {
    stream.getTracks().forEach((track) => track.stop());
  }

  recorder.start();

  return {
    stop: () =>
      new Promise<Blob>((resolve) => {
        recorder.onstop = () => {
          releaseTracks();
          resolve(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }));
        };
        recorder.stop();
      }),
    cancel: () => {
      recorder.onstop = null;
      if (recorder.state !== 'inactive') recorder.stop();
      releaseTracks();
    },
  };
}
