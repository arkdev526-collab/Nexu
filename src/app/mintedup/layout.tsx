import type { Metadata } from "next";
import { MuFooter, MuHeader } from "./_components/Chrome";
import "./mintedup.css";

export const metadata: Metadata = {
  title: {
    default: "Minted Up — antiques and collectibles, bought, sold and researched",
    template: "%s · Minted Up",
  },
  description:
    "Minted Up is a marketplace and research gateway for antiques and collectibles. Buy it, bid it, or research it before you list it.",
  openGraph: {
    title: "Minted Up",
    description:
      "Buy it, bid it, research it. A marketplace and research gateway for antiques and collectibles only.",
    type: "website",
  },
};

export default function MintedUpLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="mu-root flex min-h-screen flex-col">
      <MuHeader />
      <main className="flex-1">{children}</main>
      <MuFooter />
    </div>
  );
}
