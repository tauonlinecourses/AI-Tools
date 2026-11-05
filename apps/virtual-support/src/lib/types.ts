export type Folder = {
  id: string;
  name: string;
  position: number;
  createdAt: string;
  updatedAt: string;
};

export type Document = {
  id: string;
  folderId: string | null;
  title: string;
  body: string;
  position: number;
  contentHash: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AskSource = {
  documentId: string;
  title: string;
  folderName: string | null;
  excerpt: string;
  similarity: number;
};

export type AskResult = {
  /** `[n]` markers in the answer refer to sources[n - 1]. */
  answer: string;
  sources: AskSource[];
  /** true → sources are exactly the cited pages; sources[0] opens automatically. */
  cited: boolean;
};

export type ChatTurn = {
  role: "user" | "assistant";
  content: string;
  sources?: AskSource[];
};
