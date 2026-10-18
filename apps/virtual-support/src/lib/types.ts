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

export type ChatTurn = {
  role: "user" | "assistant";
  content: string;
  sources?: AskSource[];
};

export type Mode = "documents" | "ask";
