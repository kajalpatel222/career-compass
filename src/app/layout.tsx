import type { Metadata } from "next";
import "./globals.css";
import { AppNavigation } from "./_components/app-navigation";

export const metadata: Metadata = {
  title: "Career Compass",
  description: "An agentic AI career assistant.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return <html lang="en" className="h-full antialiased" suppressHydrationWarning><body className="min-h-full flex flex-col"><AppNavigation />{children}</body></html>;
}
