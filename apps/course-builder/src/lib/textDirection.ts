import { Extension } from "@tiptap/core";

export type TextDir = "rtl" | "ltr";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    textDirection: {
      setTextDirection: (direction: TextDir) => ReturnType;
      unsetTextDirection: () => ReturnType;
    };
  }
}

/** Adds `dir` on paragraphs, headings, and lists for LTR/RTL blocks. */
export const TextDirection = Extension.create({
  name: "textDirection",

  addOptions() {
    return {
      types: ["paragraph", "heading", "bulletList", "orderedList"],
    };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          dir: {
            default: null,
            parseHTML: (element) => {
              const dir = element.getAttribute("dir");
              return dir === "rtl" || dir === "ltr" ? dir : null;
            },
            renderHTML: (attributes) => {
              if (!attributes.dir) return {};
              return { dir: attributes.dir as string };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setTextDirection:
        (direction) =>
        ({ commands }) =>
          this.options.types
            .map((type: string) => commands.updateAttributes(type, { dir: direction }))
            .some(Boolean),
      unsetTextDirection:
        () =>
        ({ commands }) =>
          this.options.types
            .map((type: string) => commands.resetAttributes(type, "dir"))
            .some(Boolean),
    };
  },
});
