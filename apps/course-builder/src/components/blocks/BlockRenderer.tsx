import type { BlockProps, ComponentType, CourseViewMode } from "../../lib/types";
import { BannerBlock } from "./BannerBlock";
import { VideoBlock } from "./VideoBlock";
import { TextBlock } from "./TextBlock";
import { QuestionBlock } from "./QuestionBlock";

interface Props {
  type: ComponentType;
  props: BlockProps;
  mode: CourseViewMode;
  onChange: (props: BlockProps) => void;
  /** Video / banner: whether the settings panel above the placeholder is open. */
  settingsOpen?: boolean;
  onToggleSettings?: () => void;
  /** Video / banner: page title for default placeholder labels. */
  pageTitle?: string;
  /** Banner: page numbering (e.g. `1.1`) for the default name. */
  pageNumbering?: string;
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
  settingsOpen,
  onToggleSettings,
  pageTitle,
  pageNumbering,
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
          settingsOpen={settingsOpen}
          onToggleSettings={onToggleSettings}
          pageTitle={pageTitle ?? ""}
          pageNumbering={pageNumbering ?? ""}
        />
      );
    case "video":
      return (
        <VideoBlock
          props={props}
          mode={mode}
          onChange={onChange}
          settingsOpen={settingsOpen}
          onToggleSettings={onToggleSettings}
          pageTitle={pageTitle ?? ""}
          videoNumber={videoNumber ?? 1}
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
  }
}
