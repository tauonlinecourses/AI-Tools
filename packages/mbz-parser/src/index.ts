export type {
  MbzVfs,
  MbzManifest,
  MbzSection,
  MbzActivity,
  MbzFileRef,
  BlobStore,
  MbzActivityContent,
} from "./types";
export {
  extract,
  detectArchiveKind,
  sha1Hex,
  vfsGet,
  vfsText,
  vfsListPrefix,
  type ArchiveKind,
} from "./extract";
export { buildManifest } from "./parseStructure";
export {
  decodeSection,
  decodeFirstSections,
  decodeAllSections,
  makeResolveBlobUrl,
  type BlobUrlCache,
} from "./decodeSection";
export { buildFileIndex, resolvePluginfiles, decodeHtmlField } from "./resolvePluginfiles";
export { unescapeXmlEntities, textOf, xmlParser } from "./xml";
export {
  supportsHtmlLike,
  extractHtmlLikeRaw,
  HTML_FIELD_PREFERENCE,
} from "./decoders/htmlLike";
export {
  getTopLevelSections,
  getDelegatedSection,
  buildActivityNodes,
  sectionActivityCmids,
  sectionPending,
  subsectionPending,
  decodeSectionIdForActivity,
  collectSubsectionCmids,
  type CourseTreeNode,
} from "./courseTree";
export {
  vfsToMbz,
  patchXmlTagBody,
  patchActivityXmlField,
  patchSectionName,
  patchSectionSequence,
  rebuildSequence,
  encodeVfsText,
} from "./write";
