# AI-Tools

AI-Tools is a hub of internal applications for teaching, course production, and support workflows. The hub is the central launcher: staff sign in once, see the tools they are entitled to use, and open each tool from a single place.

Every tool shares the same design language and platform authentication. Some tools run as standalone apps; others are hosted inside the hub itself.

## The hub

The hub (`apps/hub`) is the homepage for the suite. It presents the catalog of tools, handles platform login and access control, and links users to the right destination — either a dedicated deployment or an in-hub route.

Tools are registered in the hub catalog (`apps/hub/src/tools.config.ts`). Each entry includes a name, short description, category, status (`live`, `beta`, or `coming-soon`), and how it is opened (standalone URL or hub path).

## Tools

| Tool | Category | Status | Description |
|---|---|---|---|
| **Video Curator** | Video | Live | Curate video transcripts into sections, then export clips, SRT, and PDF. |
| **Video Transcriber** | Video | Live | Download and install the desktop Video Transcriber from SharePoint. |
| **Course Builder** | Education | Beta | Author course structure and page content; review view for Moodle/edX implementers. |
| **TAU Support** | Education | Beta | AI-powered support assistant for TAU staff and students. |
| **Virtual Support** | Education | Beta | Organization knowledge base with grounded Q&A over staff documents. |
| **Dictionary Tool** | Education | Beta | Convert an Excel glossary (term + definition) into Moodle-importable XML. |
| **MBZ Explorer** | Tech | Beta | Inspect Moodle `.mbz` course backups — structure, activities, and decoded content. |