/** Re-export shared course-tree helpers from `@workspace/mbz-parser`. */
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
} from "@workspace/mbz-parser";
