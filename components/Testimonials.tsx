import Link from "next/link";
import { Quote } from "lucide-react";

const testimonials = [
  {
    quote:
      "Ordering before my class ends would save so much time during lunch.",
    department: "Department of Computer Science",
  },
  {
    quote:
      "I like having both Pickup and Delivery options depending on my schedule.",
    department: "Department of Mechanical Engineering",
  },
  {
    quote:
      "A simple ordering system for campus canteens would make breaks much easier.",
    department: "Department of Electrical Engineering",
  },
];

export default function Testimonials() {
  return (
    <section
      className="relative overflow-hidden bg-gradient-to-b from-[#FAF7FF] via-white to-[#F3EDFF] py-20 lg:py-28"
      aria-labelledby="testimonials-heading"
    >
      <div className="pointer-events-none absolute -left-16 top-20 h-64 w-64 rounded-full bg-[#6C2BD9]/8 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -right-20 bottom-20 h-72 w-72 rounded-full bg-[#F4C542]/10 blur-3xl" aria-hidden />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <header className="mx-auto mb-14 max-w-2xl text-center">
          <h2 id="testimonials-heading" className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            What Students Say
          </h2>
          <p className="mt-4 text-lg text-gray-600">
            Sample testimonials showing the type of feedback UniEats aims to earn
            from students.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          {testimonials.map((item) => (
            <article
              key={item.department}
              className="group rounded-3xl border border-white/60 bg-white/70 p-8 shadow-lg shadow-[#6C2BD9]/5 backdrop-blur-sm transition-all duration-300 hover:-translate-y-2 hover:shadow-xl hover:shadow-[#6C2BD9]/10"
            >
              <span className="mb-4 inline-block rounded-full bg-[#F3EDFF] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[#6C2BD9]">
                Sample Review
              </span>

              <Quote className="mb-4 h-8 w-8 text-[#6C2BD9]/40" aria-hidden />

              <p className="text-[#F4C542]" aria-label="5 out of 5 stars">★★★★★</p>

              <blockquote className="mt-4 text-gray-700 leading-relaxed">
                &ldquo;{item.quote}&rdquo;
              </blockquote>

              <footer className="mt-6 border-t border-gray-100 pt-4">
                <p className="font-semibold text-gray-900">Student</p>
                <p className="text-sm text-gray-500">{item.department}</p>
              </footer>
            </article>
          ))}
        </div>

        <div className="mt-16 rounded-3xl border border-[#6C2BD9]/10 bg-white/80 p-8 text-center shadow-lg backdrop-blur-sm sm:p-12">
          <h3 className="text-2xl font-bold text-gray-900">Ready to Try UniEats?</h3>
          <p className="mx-auto mt-4 max-w-xl text-gray-600">
            Order your favorite meals from campus canteens without waiting in
            long queues.
          </p>
          <Link
            href="/canteens"
            className="mt-8 inline-flex rounded-full bg-[#6C2BD9] px-8 py-4 text-sm font-semibold text-white transition-all duration-300 hover:-translate-y-1 hover:bg-[#F4C542] hover:text-[#2E1065]"
          >
            Order Now
          </Link>
        </div>
      </div>
    </section>
  );
}
