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

export const CopyIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={`${shrink} ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
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
