/** In-memory virtual filesystem: normalized path → bytes */
export type MbzVfs = Map<string, Uint8Array>;

export interface MbzFileRef {
  hash: string;
  originalFilename: string;
  mimetype: string;
  bucketPath: string;
}

export type MbzActivityContent =
  | { kind: "html"; html: string; referencedFiles: MbzFileRef[]; unresolvedTokens: string[] }
  | {
      kind: "h5p";
      machineName: string;
      version: string;
      parsed: unknown;
      renderer: "multichoice" | "truefalse" | "questionset" | "column" | "generic";
      /** Moodle activity intro HTML (above the H5P), already pluginfile-resolved */
      introHtml: string | null;
      referencedFiles: MbzFileRef[];
      unresolvedTokens: string[];
    }
  | { kind: "raw"; note: string };

export interface MbzActivity {
  cmid: string;
  type: string;
  name: string;
  hasGrading: boolean;
  contentStatus: "pending" | "decoded";
  content: MbzActivityContent | null;
  rawXmlPath: string;
  /** Path to activities/<modtype>_<cmid>/ folder prefix in VFS */
  activityDir: string;
}

export interface MbzSection {
  id: string;
  number: number;
  name: string;
  summaryHtml: string | null;
  summaryStatus: "pending" | "decoded";
  /** Raw summary (XML-escaped) kept for decode */
  summaryRaw: string | null;
  activityRefs: string[];
  delegatedBy: string | null;
}

export interface MbzManifest {
  sourceFile: { name: string; sha1: string; sizeBytes: number };
  course: {
    fullname: string;
    shortname: string;
    format: string;
    moodleVersion: string;
    backupSettings: { includesUsers: boolean; anonymized: boolean };
  };
  sections: MbzSection[];
  activities: MbzActivity[];
  files: MbzFileRef[];
  warnings: string[];
}

export type BlobStore = Map<string, Blob>;
