import React from "react";

type BadgeVariant = "default" | "success" | "warning" | "danger" | "info" | "brand";

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: "sm" | "md";
}

const variantStyles: Record<BadgeVariant, string> = {
  default: "bg-surface-100 text-surface-600 border-surface-200",
  success: "bg-emerald-50 text-emerald-800 border-emerald-200",
  warning: "bg-amber-50 text-amber-800 border-amber-200",
  danger:  "bg-red-50 text-red-800 border-red-200",
  info:    "bg-blue-50 text-blue-800 border-blue-200",
  brand:   "bg-black text-white border-black",
};

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = "default",
  size = "md",
}) => {
  return (
    <span
      className={[
        "inline-flex items-center font-medium border rounded-control",
        size === "sm" ? "px-2 py-0.5 text-2xs" : "px-2.5 py-1 text-xs",
        variantStyles[variant],
      ].join(" ")}
    >
      {children}
    </span>
  );
};
