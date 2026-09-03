"use client";

import { useState } from "react";
import {
  Clock,
  Mail,
  MapPin,
  Send,
  Camera,
} from "lucide-react";
import {
  CONTACT_EMAIL,
  INSTAGRAM_URL,
} from "@/lib/constants";

const faqs = [
  {
    question: "How do I place an order on UniEats?",
    answer:
      "Browse a campus canteen menu, add items to your cart, complete checkout with your student details, and confirm your order on the website.",
  },
  {
    question: "Do you offer campus delivery?",
    answer:
      "Yes. Choose Campus Delivery at checkout and provide your building, department, or block location on campus.",
  },
  {
    question: "What are your operating hours?",
    answer: "All canteens are open daily from 7:00 AM to 12:00 AM.",
  },
  {
    question: "How can I get help with my order?",
    answer:
      "Contact us by email. Our team responds quickly during business hours.",
  },
];

export default function ContactPageContent() {
  const [submitted, setSubmitted] = useState(false);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <header className="mb-12 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
          Contact Us
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base text-white/80 sm:text-lg">
          Have questions or feedback? We&apos;d love to hear from UET Lahore students.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_400px]">
        <section className="rounded-3xl border border-white/60 bg-white/90 p-6 shadow-xl shadow-[#6C2BD9]/5 backdrop-blur-sm sm:p-8">
          <h2 className="text-xl font-bold text-gray-900">Send us a message</h2>

          {submitted ? (
            <div className="mt-8 rounded-2xl bg-green-50 p-6 text-center">
              <p className="font-semibold text-green-800">
                Thank you! We&apos;ll get back to you soon.
              </p>
            </div>
          ) : (
            <form
              className="mt-6 space-y-5"
              onSubmit={(event) => {
                event.preventDefault();
                setSubmitted(true);
              }}
            >
              <FormField id="name" label="Name" required />
              <FormField id="email" label="Email" type="email" required />
              <FormField id="phone" label="Phone" type="tel" />
              <div>
                <label
                  htmlFor="message"
                  className="mb-2 block text-sm font-semibold text-gray-700"
                >
                  Message <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="message"
                  required
                  rows={5}
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm transition-colors focus:border-[#6C2BD9] focus:outline-none focus:ring-2 focus:ring-[#6C2BD9]/20"
                  placeholder="How can we help you?"
                />
              </div>
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-full bg-[#6C2BD9] px-8 py-3.5 text-sm font-semibold text-white transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#F4C542] hover:text-[#2E1065]"
              >
                <Send className="h-4 w-4" aria-hidden />
                Send Message
              </button>
            </form>
          )}
        </section>

        <aside className="space-y-4">
          <ContactCard
            icon={Camera}
            title="Instagram"
            description="@unieats_uet"
            href={INSTAGRAM_URL}
            action="Follow on Instagram"
          />
          <ContactCard
            icon={Mail}
            title="Email"
            description={CONTACT_EMAIL}
            href={`mailto:${CONTACT_EMAIL}`}
            action="Send Email"
          />
          <ContactCard
            icon={MapPin}
            title="Location"
            description="UET Lahore Main Campus"
            href="https://maps.google.com/?q=UET+Lahore"
            action="View on Maps"
          />
          <div className="rounded-3xl border border-white/60 bg-white/90 p-6 shadow-lg backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <Clock className="h-5 w-5 text-[#6C2BD9]" aria-hidden />
              <h3 className="font-bold text-gray-900">Business Hours</h3>
            </div>
            <ul className="mt-4 space-y-2 text-sm text-gray-600" role="list">
              <li>Monday – Sunday: 7:00 AM – 12:00 AM</li>
              <li>Fast Food: 10:00 AM – 12:00 AM</li>
              <li>Girls Hostel Delivery: Until 9:00 PM</li>
            </ul>
          </div>
        </aside>
      </div>

      <section className="mt-16" aria-labelledby="faq-heading">
        <h2
          id="faq-heading"
          className="mb-8 text-center text-2xl font-bold text-gray-900 sm:text-3xl"
        >
          Frequently Asked Questions
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {faqs.map((faq) => (
            <article
              key={faq.question}
              className="rounded-3xl border border-white/60 bg-white/90 p-6 shadow-lg shadow-[#6C2BD9]/5 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
            >
              <h3 className="font-bold text-gray-900">{faq.question}</h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-600">
                {faq.answer}
              </p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function FormField({
  id,
  label,
  type = "text",
  required,
}: {
  id: string;
  label: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-semibold text-gray-700">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        id={id}
        type={type}
        required={required}
        className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm transition-colors focus:border-[#6C2BD9] focus:outline-none focus:ring-2 focus:ring-[#6C2BD9]/20"
      />
    </div>
  );
}

function ContactCard({
  icon: Icon,
  title,
  description,
  href,
  action,
}: {
  icon: typeof Mail;
  title: string;
  description: string;
  href: string;
  action: string;
}) {
  return (
    <div className="rounded-3xl border border-white/60 bg-white/90 p-6 shadow-lg backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#F3EDFF]">
          <Icon className="h-5 w-5 text-[#6C2BD9]" aria-hidden />
        </div>
        <div>
          <h3 className="font-bold text-gray-900">{title}</h3>
          <p className="mt-1 text-sm text-gray-600">{description}</p>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex text-sm font-semibold text-[#6C2BD9] transition-colors hover:text-[#5B21B6] hover:underline hover:underline-offset-4"
          >
            {action}
          </a>
        </div>
      </div>
    </div>
  );
}
