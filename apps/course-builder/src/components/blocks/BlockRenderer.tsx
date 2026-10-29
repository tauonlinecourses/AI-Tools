import type { BlockProps, ComponentType, CourseViewMode } from "../../lib/types";
import { BannerBlock } from "./BannerBlock";
import { VideoBlock } from "./VideoBlock";
import { TextBlock } from "./TextBlock";
import { QuestionBlock } from "./QuestionBlock";
import { ImageBlock } from "./ThumbnailBlock";
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
  /** Video / banner: page title for default placeholder labels. */
  pageTitle?: string;
  /** Video block: 1-based index among videos on this page. */
  videoNumber?: number;
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
      return <ImageBlock props={props} mode={mode} onChange={onChange} />;
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
      return <ImageBlock props={props} mode={mode} onChange={onChange} />;
  }
}
