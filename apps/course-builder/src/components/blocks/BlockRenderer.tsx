import type { BlockProps, ComponentType } from "../../lib/types";
import { BannerBlock } from "./BannerBlock";
import { VideoBlock } from "./VideoBlock";
import { TextBlock } from "./TextBlock";
import { QuestionBlock } from "./QuestionBlock";

interface Props {
  type: ComponentType;
  props: BlockProps;
  editable: boolean;
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
}

/** Single renderer per block type, shared by the editor (editable) and review (read-only) views. */
export function BlockRenderer({
  type,
  props,
  editable,
  onChange,
  settingsOpen,
  onToggleSettings,
  pageTitle,
  pageNumbering,
  videoNumber,
}: Props) {
  switch (type) {
    case "banner":
      return (
        <BannerBlock
          props={props}
          editable={editable}
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
          editable={editable}
          onChange={onChange}
          settingsOpen={settingsOpen}
          onToggleSettings={onToggleSettings}
          pageTitle={pageTitle ?? ""}
          videoNumber={videoNumber ?? 1}
        />
      );
    case "text":
      return <TextBlock props={props} editable={editable} onChange={onChange} />;
    case "question":
      return <QuestionBlock props={props} editable={editable} onChange={onChange} />;
  }
}
