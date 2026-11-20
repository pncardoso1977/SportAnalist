import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Jogo ao vivo | SportAnalist",
  robots: { index: false, follow: false },
};

export default function PublicLiveMatchLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
