export type ComponentBankFields = {
  href: string;
  text: string;
};

export type ComponentBankItem = {
  id: string;
  title: string;
  description?: string;
  /**
   * HTML template with `{{href}}` and `{{text}}` placeholders.
   * Copy/preview always use the filled template (never the raw placeholders).
   */
  html: string;
  /** Default values for the link + button-text inputs. */
  fields: ComponentBankFields;
  /**
   * Substrings to highlight in the (hidden) code view.
   * Kept for when the HTML pane is shown again.
   */
  editables?: string[];
};

function escapeAttr(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/** Fill `{{href}}` / `{{text}}` in a component template. */
export function renderComponentHtml(
  template: string,
  fields: ComponentBankFields,
): string {
  return template
    .replaceAll("{{href}}", escapeAttr(fields.href))
    .replaceAll("{{text}}", escapeText(fields.text));
}

/** Drupal-ready HTML snippets for one-click copy. */
export const COMPONENT_BANK: ComponentBankItem[] = [
  {
    id: "workshop-register-button",
    title: "כפתור הרשמה לסדנה",
    description:
      "כפתור ממורכז עם רקע תכלת. שנו את הקישור ואת הטקסט לפי הצורך.",
    html: `<p class="rtecenter" dir="RTL"><strong><span style="font-size:20px"><a href="{{href}}" style="background-color: #00c0f3; color: #fff; padding: 8px; border-radius: 5px; text-decoration: none;" target="_blank">{{text}}</a></span></strong></p>`,
    fields: {
      href: "/example_page",
      text: "להרשמה לסדנה",
    },
    editables: ["/example_page", "להרשמה לסדנה"],
  },
];
