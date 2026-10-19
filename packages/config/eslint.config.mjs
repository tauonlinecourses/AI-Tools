import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

const NODE_FILES = [
  "api/**/*.ts",
  "server/**/*.ts",
  "vite.config.ts",
  "tailwind.config.ts",
  "*.config.{js,mjs,cjs,ts}",
];

/**
 * Shared flat config for every app and package.
 * Usage in a workspace: `export default createConfig();` from `eslint.config.mjs`.
 * Pass `ignores` for extra generated or vendored paths.
 */
export function createConfig({ ignores = [] } = {}) {
  return tseslint.config(
    {
      ignores: [
        "dist/**",
        "node_modules/**",
        ".turbo/**",
        "**/*.cjs",
        "**/*.timestamp-*.mjs",
        ...ignores,
      ],
    },
    {
      files: ["**/*.{ts,tsx,js,mjs}"],
      extends: [js.configs.recommended, ...tseslint.configs.recommended],
      languageOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        globals: globals.browser,
      },
      rules: {
        "@typescript-eslint/no-unused-vars": [
          "warn",
          { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
        ],
      },
    },
    {
      files: ["**/*.tsx"],
      plugins: {
        "react-hooks": reactHooks,
        "react-refresh": reactRefresh,
      },
      rules: {
        "react-hooks/rules-of-hooks": "error",
        "react-hooks/exhaustive-deps": "warn",
        "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      },
    },
    {
      files: NODE_FILES,
      languageOptions: {
        globals: { ...globals.node },
      },
    }
  );
}

export default createConfig();
