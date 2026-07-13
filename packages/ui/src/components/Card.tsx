import React from "react";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: "none" | "sm" | "md" | "lg";
  border?: boolean;
  hover?: boolean;
  onClick?: () => void;
}

const paddingStyles = {
  none: "",
  sm:   "p-3",
  md:   "p-5",
  lg:   "p-7",
};

export const Card: React.FC<CardProps> = ({
  children,
  className = "",
  padding = "md",
  border = true,
  hover = false,
  onClick,
}) => {
  return (
    <div
      onClick={onClick}
      className={[
        "bg-white",
        border ? "border border-surface-200" : "",
        hover ? "hover:bg-surface-50 transition-colors duration-fast cursor-pointer" : "",
        paddingStyles[padding],
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
};
