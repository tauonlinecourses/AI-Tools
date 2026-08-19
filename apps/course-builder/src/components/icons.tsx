import React from "react";

interface IconProps {
  className?: string;
}

/** Size defaults via className default arg so callers can override without conflicting Tailwind utilities. */
const shrink = "shrink-0";

export const PlusIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={`${shrink} ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
  </svg>
);

/** Chevron pointing "start-ward" (left in RTL is handled by rotation via className). */
export const ChevronDownIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={`${shrink} ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
  </svg>
);

export const ChevronLeftIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={`${shrink} ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
  </svg>
);

export const ChevronRightIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={`${shrink} ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
  </svg>
);

export const TrashIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={`${shrink} ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
    />
  </svg>
);

export const GripIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={`${shrink} ${className}`} fill="currentColor" viewBox="0 0 24 24">
    <circle cx="9" cy="6" r="1.5" />
    <circle cx="15" cy="6" r="1.5" />
    <circle cx="9" cy="12" r="1.5" />
    <circle cx="15" cy="12" r="1.5" />
    <circle cx="9" cy="18" r="1.5" />
    <circle cx="15" cy="18" r="1.5" />
  </svg>
);

/** Vertical three-dots overflow menu control. */
export const MoreVerticalIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={`${shrink} ${className}`} fill="currentColor" viewBox="0 0 24 24">
    <circle cx="12" cy="5" r="1.75" />
    <circle cx="12" cy="12" r="1.75" />
    <circle cx="12" cy="19" r="1.75" />
  </svg>
);

export const PencilIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={`${shrink} ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125"
    />
  </svg>
);

export const CheckIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={`${shrink} ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
  </svg>
);

/** Check mark inside a circle — resolve control for comments. */
export const CheckCircleIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={`${shrink} ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  </svg>
);

export const CopyIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={`${shrink} ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

/** Page/document with a plus — duplicate (distinct from clipboard copy). */
export const DuplicateIcon: React.FC<IconProps> = ({ className = "w-5 h-5" }) => (
  <svg className={`${shrink} ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M8 3.5h5.5L18 8v10.5A1.5 1.5 0 0116.5 20h-8A1.5 1.5 0 017 18.5v-13A1.5 1.5 0 018 3.5z"
    />
    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 3.5V8H18" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 11.5v5M9.5 14h5" />
  </svg>
);

/** Horizontal swap arrows — signals a clickable status cycle. */
export const SwapIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={`${shrink} ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"
    />
  </svg>
);

/** Circular play control — dark disc with light triangle (video placeholder). */
export const PlayCircleIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={`${shrink} ${className}`} viewBox="0 0 64 64" aria-hidden>
    <circle cx="32" cy="32" r="32" fill="#4A4A4A" fillOpacity="0.85" />
    <path d="M26 20.5v23L46 32 26 20.5z" fill="#E8E8E8" />
  </svg>
);

export const XIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={`${shrink} ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

/** Speech-bubble comment icon (Word-style block comments). */
export const CommentIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={`${shrink} ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M8.625 9.75a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 01.778-.332 48.078 48.078 0 005.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z"
    />
  </svg>
);

export const BannerIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={`${shrink} ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <rect x="3" y="5" width="18" height="14" rx="0" />
    <path strokeLinecap="round" d="M7 10h10M7 14h6" />
  </svg>
);

export const VideoIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={`${shrink} ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <rect x="3" y="6" width="13" height="12" rx="0" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M16 10l5-3v10l-5-3" />
  </svg>
);

export const TextIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={`${shrink} ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" d="M4 6h16M4 10h16M4 14h10M4 18h7" />
  </svg>
);

export const QuestionIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={`${shrink} ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z"
    />
  </svg>
);

export const ThumbnailIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={`${shrink} ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z"
    />
  </svg>
);

export const LinkIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={`${shrink} ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244"
    />
  </svg>
);

export const UnlinkIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={`${shrink} ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244M6 18L18 6"
    />
  </svg>
);

export const LockIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={`${shrink} ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
    />
  </svg>
);

export const WordCloudIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={`${shrink} ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" d="M3 15h4M7 11h5M14 11h4M5 7h6M13 7h6M8 19h8M2 15h0M20 11h0" />
  </svg>
);

export const NotesBoardIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={`${shrink} ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <rect x="3" y="3" width="18" height="18" rx="1" />
    <path strokeLinecap="round" d="M9 3v18M15 3v18" />
    <path strokeLinecap="round" d="M3 9h18" />
  </svg>
);

export const CalendarIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={`${shrink} ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"
    />
  </svg>
);

export const FolderIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={`${shrink} ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M3.75 9.75h16.5m-16.5 0A2.25 2.25 0 015.25 7.5h3.379c.414 0 .81.168 1.098.465l1.346 1.37c.288.297.684.465 1.098.465H18.75a2.25 2.25 0 012.25 2.25v6.75a2.25 2.25 0 01-2.25 2.25H5.25a2.25 2.25 0 01-2.25-2.25V9.75z"
    />
  </svg>
);

/** Eye with a slash — hidden / unavailable from a view. */
export const EyeOffIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={`${shrink} ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"
    />
  </svg>
);
