declare module 'espeak-ng' {
  interface ESpeakNgModule {
    FS: {
      readFile(path: string, opts?: { encoding?: string }): Uint8Array | string;
    };
  }

  export default function ESpeakNg(opts?: {
    arguments?: string[];
    locateFile?: (path: string, prefix: string) => string;
  }): Promise<ESpeakNgModule>;
}
