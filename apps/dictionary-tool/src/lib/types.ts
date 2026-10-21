export interface GlossaryEntry {
  concept: string;
  definition: string;
}

export interface ParseExcelResult {
  entries: GlossaryEntry[];
  /** Rows with a concept but empty definition (still included). */
  emptyDefinitionCount: number;
  warnings: string[];
}

export interface GlossaryXmlInput {
  name: string;
  intro: string;
  entries: GlossaryEntry[];
}
