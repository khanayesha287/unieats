import type { ReactNode } from "react";

interface PageShellProps {
  children: ReactNode;
  className?: string;
}

export default function PageShell({ children, className = "" }: PageShellProps) {
  return (
    <main
      className={`relative min-h-screen overflow-hidden bg-gradient-to-b from-[#FAF7FF] via-white to-[#F3EDFF] pt-20 ${className}`}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-gradient-to-b from-[#6C2BD9] via-[#6C2BD9]/40 to-transparent"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -left-32 top-32 h-72 w-72 rounded-full bg-[#6C2BD9]/10 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-24 top-64 h-64 w-64 rounded-full bg-[#F4C542]/15 blur-3xl"
        aria-hidden
      />
      <div className="relative">{children}</div>
    </main>
  );
}
