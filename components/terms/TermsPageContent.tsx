import { MessageCircle } from "lucide-react";
import { CONTACT_EMAIL } from "@/lib/constants";

const sections = [
  {
    number: "1",
    title: "About UniEats",
    content:
      "UniEats is a food ordering platform designed for students, teachers, and staff at UET Lahore Main Campus. It allows users to browse available food, place orders, and choose pickup or campus delivery.",
  },
  {
    number: "2",
    title: "Orders",
    content: null,
    bullets: [
      "Orders must be placed through the UniEats website.",
      "Please review your selected items and order details carefully before confirming your order.",
      "Once an order has been accepted or preparation has started, cancellation may not be possible.",
      "Each order is assigned a unique Order ID for identification and support.",
    ],
  },
  {
    number: "3",
    title: "Payment",
    content: null,
    bullets: [
      "Payment is made upon receiving the order.",
      "The amount payable is based on the prices displayed during checkout.",
      "Please ensure that the required payment is available when receiving your order.",
    ],
  },
  {
    number: "4",
    title: "Delivery",
    content: null,
    bullets: [
      "Delivery is available within supported areas of the UET Lahore Main Campus.",
      "A delivery charge applies per order, regardless of the number of food items ordered.",
      "Delivery can be made to a suitable department, hostel, or other supported campus location.",
      "Delivery time may vary depending on the number of orders, food preparation time, and delivery conditions.",
      "Users should provide an accurate delivery location to avoid delays.",
    ],
  },
  {
    number: "5",
    title: "Pickup",
    content: null,
    bullets: [
      "Users who select Pickup are responsible for collecting their order from the selected canteen.",
      "Please collect your order when it is ready.",
      "UniEats is not responsible for delays caused by a user arriving late for pickup.",
    ],
  },
  {
    number: "6",
    title: "Menu & Food Availability",
    content: null,
    bullets: [
      "All menu items are subject to availability.",
      "Food items may become unavailable without prior notice.",
      "UniEats may update food items, prices, categories, images, and availability when required.",
      "The final price shown at checkout will be considered the applicable order amount.",
    ],
  },
  {
    number: "7",
    title: "Order Accuracy",
    content:
      "Users are responsible for providing correct information when placing an order, including their name, order details, and delivery location when applicable. Incorrect information may result in delays, difficulty contacting the student, or unsuccessful delivery.",
  },
  {
    number: "8",
    title: "Order Issues",
    content:
      "If there is a problem with an order, contact UniEats Support by email and provide your Order ID so the issue can be identified and resolved.",
  },
  {
    number: "9",
    title: "Service Availability",
    content:
      "UniEats depends on food availability. Orders may not be processed when items are unavailable or when the ordering service is unavailable.",
  },
  {
    number: "10",
    title: "Changes to These Terms",
    content:
      "UniEats may update these Terms & Conditions when necessary to reflect changes in the service, menu, ordering process, or delivery system. Any updated terms will be published on this website.",
  },
];

export default function TermsPageContent() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <header className="mb-12 text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white/90 backdrop-blur-sm">
          Legal
        </span>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
          Terms &amp; Conditions
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base text-white/80 sm:text-lg">
          Please read these terms carefully before placing an order on UniEats.
        </p>
      </header>

      <div className="space-y-4">
        {sections.map((sec) => (
          <section
            key={sec.number}
            className="rounded-3xl border border-white/60 bg-white/90 p-6 shadow-lg shadow-[#6C2BD9]/5 backdrop-blur-sm sm:p-8"
            aria-labelledby={`terms-${sec.number}`}
          >
            <h2
              id={`terms-${sec.number}`}
              className="flex items-center gap-2 text-base font-bold text-gray-900 sm:text-lg"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#F3EDFF] text-sm font-bold text-[#6C2BD9]">
                {sec.number}
              </span>
              {sec.title}
            </h2>
            {sec.content && (
              <p className="mt-3 text-sm leading-relaxed text-gray-600">
                {sec.content}
              </p>
            )}
            {sec.bullets && (
              <ul className="mt-3 space-y-2 text-sm leading-relaxed text-gray-600">
                {sec.bullets.map((b, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#6C2BD9]" aria-hidden />
                    {b}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>

      <section
        className="mt-10 rounded-3xl border border-white/60 bg-white/90 p-8 text-center shadow-xl shadow-[#6C2BD9]/5 backdrop-blur-sm"
        aria-labelledby="terms-contact"
      >
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F3EDFF]">
          <MessageCircle className="h-6 w-6 text-[#6C2BD9]" aria-hidden />
        </div>
        <h2 id="terms-contact" className="mt-4 text-xl font-bold text-gray-900">
          Have a question?
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-gray-600">
          If you have any questions about these Terms &amp; Conditions, contact
          UniEats Support by email.
        </p>
        <a
          href={`mailto:${CONTACT_EMAIL}`}
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#6C2BD9] px-7 py-3 text-sm font-semibold text-white transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#F4C542] hover:text-[#2E1065]"
        >
          <MessageCircle className="h-4 w-4" aria-hidden />
          Email Support
        </a>
      </section>
    </div>
  );
}
