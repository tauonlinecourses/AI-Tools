import React from "react";

interface SpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeStyles = { sm: "w-4 h-4", md: "w-6 h-6", lg: "w-8 h-8" };

export const Spinner: React.FC<SpinnerProps> = ({ size = "md", className = "" }) => (
  <div
    className={[
      "border-2 border-gray-200 border-t-black rounded-full animate-spin",
      sizeStyles[size],
      className,
    ].join(" ")}
  />
);
