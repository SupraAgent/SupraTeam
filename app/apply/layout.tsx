import type { Metadata } from "next";
import "@/app/globals.css";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: "Apply — SuperDapp Competition",
  description: "Apply for grants, funding, or marketing support for your project built on Supra",
};

export default function ApplyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-[hsl(225,35%,5%)]">
      <Suspense fallback={null}>{children}</Suspense>
    </div>
  );
}
