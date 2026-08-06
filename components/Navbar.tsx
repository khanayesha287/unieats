"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const navLinks = [
  { label: "Home", href: "/" },
  { label: "Menu", href: "/menu" },
  { label: "Contact", href: "/contact" },
];

function isNavActive(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function Navbar() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  return (
    <>
      <header
        className={`fixed inset-x-0 top-0 z-50 h-20 transition-all duration-500 ${
          scrolled
            ? "border-b border-white/20 bg-white/80 shadow-[0_8px_32px_rgba(108,43,217,0.08)] backdrop-blur-xl"
            : "bg-transparent"
        }`}
        role="banner"
      >
        <nav
          className="mx-auto flex h-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8"
          aria-label="Main navigation"
        >
          <Link
            href="/"
            className="group flex items-center gap-3 transition-opacity hover:opacity-90"
            aria-label="UniEats home"
          >
            <Image
              src="/logo.png"
              alt="UniEats logo"
              width={44}
              height={44}
              className="h-11 w-11 rounded-xl object-cover shadow-sm"
              priority
            />
            <div className="hidden sm:block">
              <p
                className={`text-lg font-bold tracking-tight transition-colors ${
                  scrolled ? "text-[#6C2BD9]" : "text-white"
                }`}
              >
                UniEats
              </p>
              <p
                className={`text-[10px] font-medium uppercase tracking-[0.2em] ${
                  scrolled ? "text-gray-500" : "text-white/80"
                }`}
              >
                Order • Pickup • Enjoy
              </p>
            </div>
          </Link>

          <ul className="hidden items-center gap-8 md:flex" role="list">
            {navLinks.map((link) => {
              const active = isNavActive(link.href, pathname);

              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    aria-current={active ? "page" : undefined}
                    className={`group relative text-sm font-medium transition-colors ${
                      active
                        ? scrolled
                          ? "text-[#6C2BD9]"
                          : "text-white"
                        : scrolled
                          ? "text-gray-700 hover:text-[#6C2BD9]"
                          : "text-white/90 hover:text-white"
                    }`}
                  >
                    {link.label}
                    <span
                      className={`absolute -bottom-1 left-0 h-0.5 rounded-full bg-[#F4C542] transition-all duration-300 ${
                        active ? "w-full" : "w-0 group-hover:w-full"
                      }`}
                    />
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className="hidden items-center gap-3 md:flex">
            <Link
              href="/login"
              className={`rounded-full border px-5 py-2.5 text-sm font-semibold transition-all duration-300 hover:-translate-y-0.5 ${
                scrolled
                  ? "border-[#6C2BD9] text-[#6C2BD9] hover:bg-[#6C2BD9]/5"
                  : "border-white/60 text-white hover:border-white hover:bg-white/10"
              }`}
            >
              Login
            </Link>
            <Link
              href="/menu/ssc"
              className="rounded-full bg-[#6C2BD9] px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#6C2BD9]/25 transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#F4C542] hover:text-[#2E1065] hover:shadow-[#F4C542]/30"
            >
              Order Now
            </Link>
          </div>

          <button
            type="button"
            className={`relative z-50 flex h-10 w-10 items-center justify-center rounded-xl md:hidden ${
              scrolled || menuOpen
                ? "text-[#6C2BD9]"
                : "text-white"
            }`}
            onClick={() => setMenuOpen((prev) => !prev)}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
          >
            <span className="sr-only">{menuOpen ? "Close menu" : "Open menu"}</span>
            <div className="flex w-5 flex-col gap-1.5">
              <span
                className={`block h-0.5 w-full rounded-full bg-current transition-all duration-300 ${
                  menuOpen ? "translate-y-2 rotate-45" : ""
                }`}
              />
              <span
                className={`block h-0.5 w-full rounded-full bg-current transition-all duration-300 ${
                  menuOpen ? "opacity-0" : ""
                }`}
              />
              <span
                className={`block h-0.5 w-full rounded-full bg-current transition-all duration-300 ${
                  menuOpen ? "-translate-y-2 -rotate-45" : ""
                }`}
              />
            </div>
          </button>
        </nav>
      </header>

      <div
        id="mobile-menu"
        className={`fixed inset-0 z-40 md:hidden ${
          menuOpen ? "pointer-events-auto" : "pointer-events-none"
        }`}
        aria-hidden={!menuOpen}
      >
        <div
          className={`absolute inset-0 bg-[#2E1065]/60 backdrop-blur-sm transition-opacity duration-500 ${
            menuOpen ? "opacity-100" : "opacity-0"
          }`}
          onClick={() => setMenuOpen(false)}
        />
        <div
          className={`absolute right-0 top-0 flex h-full w-[min(100%,320px)] flex-col bg-white shadow-2xl transition-transform duration-500 ease-out ${
            menuOpen ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <div className="flex items-center gap-3 border-b border-gray-100 px-6 py-6">
            <Image
              src="/logo.png"
              alt=""
              width={40}
              height={40}
              className="h-10 w-10 rounded-xl object-cover"
              aria-hidden
            />
            <div>
              <p className="font-bold text-[#6C2BD9]">UniEats</p>
              <p className="text-[10px] uppercase tracking-[0.15em] text-gray-500">
                Order • Pickup • Enjoy
              </p>
            </div>
          </div>

          <ul className="flex flex-1 flex-col gap-1 px-4 py-6" role="list">
            {navLinks.map((link) => {
              const active = isNavActive(link.href, pathname);

              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    onClick={() => setMenuOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={`block rounded-xl px-4 py-3 text-base font-medium transition-colors ${
                      active
                        ? "bg-[#F3EDFF] text-[#6C2BD9]"
                        : "text-gray-700 hover:bg-[#F3EDFF] hover:text-[#6C2BD9]"
                    }`}
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className="flex flex-col gap-3 border-t border-gray-100 px-6 py-6">
            <Link
              href="/login"
              onClick={() => setMenuOpen(false)}
              className="rounded-full border border-[#6C2BD9] px-5 py-3 text-center text-sm font-semibold text-[#6C2BD9] transition-colors hover:bg-[#6C2BD9]/5"
            >
              Login
            </Link>
            <Link
              href="/menu/ssc"
              onClick={() => setMenuOpen(false)}
              className="rounded-full bg-[#6C2BD9] px-5 py-3 text-center text-sm font-semibold text-white transition-all hover:bg-[#F4C542] hover:text-[#2E1065]"
            >
              Order Now
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
