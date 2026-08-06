import { Clock3, Sparkles } from "lucide-react";

export default function ComingSoonCard() {
  return (
    <div className="rounded-[32px] border border-white/70 bg-white/90 p-8 text-center shadow-xl shadow-[#6C2BD9]/10 sm:p-10">
      <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[#F3EDFF] text-[#6C2BD9]">
        <Sparkles className="h-10 w-10" aria-hidden />
      </div>
      <h2 className="mt-6 text-2xl font-bold text-gray-900">Menu Coming Soon</h2>
      <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-gray-600 sm:text-base">
        This category is being prepared for students. Check back soon for the latest dishes.
      </p>
      <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#F3EDFF] px-4 py-2 text-sm font-medium text-[#6C2BD9]">
        <Clock3 className="h-4 w-4" aria-hidden />
        Fresh menu updates coming soon
      </div>
    </div>
  );
}
