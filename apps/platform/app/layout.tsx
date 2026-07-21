import type { Metadata } from "next";
import "@workspace/ui/styles";

export const metadata: Metadata = {
  title: "AI Tools",
  description: "Internal AI tools platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
