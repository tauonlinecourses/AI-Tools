import type { Config } from "tailwindcss";

/**
 * Design tokens — mirrored from Video Curator (`apps/video-curator`).
 *
 * Rules:
 * - Light mode only
 * - System sans-serif
 * - Minimal UI, high contrast (black / white / gray)
 * - No gradients, no heavy shadows
 * - No rounded corners by default (use `rounded-control` / `rounded-timeline` only where documented)
 */
const config: Omit<Config, "content"> = {
  darkMode: "class",
  theme: {
    extend: {
      // ─── Color Palette ───────────────────────────────────────────────
      // Single source of truth. Every app uses these tokens.
      colors: {
        // Brand = high-contrast black primary (Video Curator primary actions)
        brand: {
          50:  "#f9fafb", // gray-50
          100: "#f3f4f6", // gray-100
          200: "#e5e7eb", // gray-200
          300: "#d1d5db", // gray-300
          400: "#9ca3af", // gray-400
          500: "#000000", // Primary action fill
          600: "#111827", // gray-900 — hover
          700: "#030712", // near-black — active
          800: "#111827",
          900: "#111827",
          950: "#030712",
        },
        // Neutral (UI chrome, text, borders) — Tailwind gray scale
        surface: {
          0:   "#ffffff",
          50:  "#f9fafb", // gray-50
          100: "#f3f4f6", // gray-100
          200: "#e5e7eb", // gray-200
          300: "#d1d5db", // gray-300
          400: "#9ca3af", // gray-400
          500: "#6b7280", // gray-500
          600: "#4b5563", // gray-600
          700: "#374151", // gray-700
          800: "#1f2937", // gray-800
          900: "#111827", // gray-900
          950: "#030712", // gray-950
        },
        // Semantic (match Tailwind defaults used in Video Curator)
        success: "#10b981",
        warning: "#f59e0b",
        danger:  "#ef4444",
        info:    "#3b82f6",
        // Categorical accents (section spines / charts — from Video Curator SECTION_COLORS)
        accent: {
          red:    "#EF4444",
          blue:   "#3B82F6",
          amber:  "#F59E0B",
          green:  "#10B981",
          purple: "#8B5CF6",
          pink:   "#EC4899",
          cyan:   "#06B6D4",
          orange: "#F97316",
        },
      },

      // ─── Typography ──────────────────────────────────────────────────
      fontFamily: {
        // System sans only — matches Video Curator "System sans-serif"
        display: ["system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica", "Arial", "sans-serif"],
        body:    ["system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica", "Arial", "sans-serif"],
        mono:    ["ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "monospace"],
      },
      fontSize: {
        "2xs": ["0.625rem", { lineHeight: "0.875rem" }],
        xs:   ["0.75rem",  { lineHeight: "1rem" }],
        sm:   ["0.875rem", { lineHeight: "1.25rem" }],
        base: ["1rem",     { lineHeight: "1.5rem" }],
        lg:   ["1.125rem", { lineHeight: "1.75rem" }],
        xl:   ["1.25rem",  { lineHeight: "1.75rem" }],
        "2xl":["1.5rem",   { lineHeight: "2rem" }],
        "3xl":["1.875rem", { lineHeight: "2.25rem" }],
        "4xl":["2.25rem",  { lineHeight: "2.5rem" }],
      },

      // ─── Spacing ─────────────────────────────────────────────────────
      // Uses Tailwind defaults — do not override here.
      // Stick to the 4px grid: 1=4px, 2=8px, 3=12px, 4=16px, 6=24px, 8=32px

      // ─── Border Radius ───────────────────────────────────────────────
      // Sharp by default. Named exceptions match Video Curator docs.
      borderRadius: {
        none:     "0",
        sm:       "0",
        DEFAULT:  "0",
        md:       "0",
        lg:       "0",
        xl:       "0",
        "2xl":    "0",
        "3xl":    "0",
        control:  "6px", // buttons, tabs, upload cards, badges
        timeline: "3px", // timeline / editing-software chrome
        full:     "9999px", // spinners only
      },

      // ─── Shadows ─────────────────────────────────────────────────────
      // No heavy shadows. Keep only a high-contrast focus ring.
      boxShadow: {
        sm:   "none",
        md:   "none",
        lg:   "none",
        xl:   "none",
        none: "none",
        glow: "0 0 0 2px #000000", // black focus ring
      },

      // ─── Animation ───────────────────────────────────────────────────
      transitionTimingFunction: {
        smooth: "cubic-bezier(0.4, 0, 0.2, 1)",
      },
      transitionDuration: {
        fast:   "100ms",
        normal: "150ms",
        slow:   "250ms",
      },
    },
  },
  plugins: [],
};

export default config;
