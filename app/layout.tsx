import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Authent", template: "%s · Authent" },
  description: "Create an account and sign in to Authent.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
