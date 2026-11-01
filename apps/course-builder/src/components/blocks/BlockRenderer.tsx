import type { BlockProps, ComponentType, CourseViewMode } from "../../lib/types";
import { BannerBlock } from "./BannerBlock";
import { VideoBlock } from "./VideoBlock";
import { TextBlock } from "./TextBlock";
import { QuestionBlock } from "./QuestionBlock";
import { ImageBlock } from "./ThumbnailBlock";
import { TextUnitBlock } from "./TextUnitBlock";
import { ButtonBlock } from "./ButtonBlock";
import { NotesBoardBlock } from "./NotesBoardBlock";
import { WordCloudBlock } from "./WordCloudBlock";
import { ForumBlock } from "./ForumBlock";
import { InteractiveVideoBlock } from "./InteractiveVideoBlock";

interface Props {
  type: ComponentType;
  props: BlockProps;
  mode: CourseViewMode;
  onChange: (props: BlockProps) => void;
  /** Video / banner / image: page title for default placeholder labels. */
  pageTitle?: string;
  /** Video block: 1-based index among videos on this page. */
  videoNumber?: number;
  /** Image block: 1-based index among images on this page. */
  imageNumber?: number;
  /** text_unit / interactive_unit: 1-based index among that type on this page. */
  unitNumber?: number;
  /** Implement mode: copy an answer option and mark the component implemented. */
  onCopyOption?: (text: string) => void;
}

/** Single renderer per block type, shared by edit / implement / review views. */
export function BlockRenderer({
  type,
  props,
  mode,
  onChange,
  pageTitle,
  videoNumber,
  imageNumber,
  unitNumber,
  onCopyOption,
}: Props) {
  switch (type) {
    case "banner":
      return (
        <BannerBlock
          props={props}
          mode={mode}
          onChange={onChange}
          pageTitle={pageTitle ?? ""}
        />
      );
    case "video":
      return (
        <VideoBlock
          props={props}
          mode={mode}
          onChange={onChange}
          pageTitle={pageTitle ?? ""}
          videoNumber={videoNumber ?? 1}
        />
      );
    case "interactive_video":
      return (
        <InteractiveVideoBlock
          props={props}
          mode={mode}
          onChange={onChange}
          pageTitle={pageTitle ?? ""}
          videoNumber={videoNumber ?? 1}
          onCopyOption={onCopyOption}
        />
      );
    case "text":
      return <TextBlock props={props} mode={mode} onChange={onChange} />;
    case "question":
      return (
        <QuestionBlock
          props={props}
          mode={mode}
          onChange={onChange}
          onCopyOption={onCopyOption}
        />
      );
    case "image":
      return (
        <ImageBlock
          props={props}
          mode={mode}
          onChange={onChange}
          pageTitle={pageTitle ?? ""}
          imageNumber={imageNumber ?? 1}
        />
      );
    case "text_unit":
    case "interactive_unit":
      return (
        <TextUnitBlock
          props={props}
          mode={mode}
          onChange={onChange}
          pageTitle={pageTitle ?? ""}
          unitNumber={unitNumber ?? 1}
          unitType={type}
        />
      );
    case "button":
      return <ButtonBlock props={props} mode={mode} onChange={onChange} />;
    case "notes_board":
      return <NotesBoardBlock props={props} mode={mode} onChange={onChange} />;
    case "word_cloud":
      return <WordCloudBlock props={props} mode={mode} onChange={onChange} />;
    case "forum":
      return <ForumBlock props={props} mode={mode} onChange={onChange} />;
    default:
      // Legacy "thumbnail" rows or unknown types — treat as image
      return (
        <ImageBlock
          props={props}
          mode={mode}
          onChange={onChange}
          pageTitle={pageTitle ?? ""}
          imageNumber={imageNumber ?? 1}
        />
      );
  }
}
