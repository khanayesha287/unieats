"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { getRoleBadge } from "@/lib/auth";

const customerLinks = [
  { label: "Home", href: "/" },
  { label: "Canteens", href: "/canteens" },
  { label: "Menu", href: "/menu" },
  { label: "Cart", href: "/cart" },
];

function isNavActive(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

function getPortalLinks(role: string | undefined) {
  const links: { label: string; href: string }[] = [];
  if (role === "admin") {
    links.push({ label: "Admin Dashboard", href: "/admin" });
    links.push({ label: "Canteen Portal", href: "/canteen" });
    links.push({ label: "Driver Portal", href: "/driver" });
  } else if (role === "canteen_owner") {
    links.push({ label: "Canteen Portal", href: "/canteen" });
  } else if (role === "driver") {
    links.push({ label: "Driver Portal", href: "/driver" });
  }
  return links;
}

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { profile, signOut } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  const portalLinks = getPortalLinks(profile?.role);
  const isAuthenticated = !!profile;

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Close more menu on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen]);

  // Close more menu on route change
  useEffect(() => { setMoreOpen(false); }, [pathname]);

  const handleSignOut = async () => {
    setMenuOpen(false);
    setMoreOpen(false);
    await signOut();
    router.push("/");
  };

  const linkColor = (active: boolean) =>
    active
      ? scrolled ? "text-[#6C2BD9]" : "text-white"
      : scrolled ? "text-gray-700 hover:text-[#6C2BD9]" : "text-white/90 hover:text-white";

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
          {/* Logo */}
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
              <p className={`text-lg font-bold tracking-tight transition-colors ${
                scrolled ? "text-[#6C2BD9]" : "text-white"
              }`}>UniEats</p>
              <p className={`text-[10px] font-medium uppercase tracking-[0.2em] ${
                scrolled ? "text-gray-500" : "text-white/80"
              }`}>ORDER | PICKUP | ENJOY</p>
            </div>
          </Link>

          {/* Desktop nav links */}
          <ul className="hidden items-center gap-8 md:flex" role="list">
            {customerLinks.map((link) => {
              const active = isNavActive(link.href, pathname);
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    aria-current={active ? "page" : undefined}
                    className={`group relative text-sm font-medium transition-colors ${linkColor(active)}`}
                  >
                    {link.label}
                    <span className={`absolute -bottom-1 left-0 h-0.5 rounded-full bg-[#F4C542] transition-all duration-300 ${
                      active ? "w-full" : "w-0 group-hover:w-full"
                    }`} />
                  </Link>
                </li>
              );
            })}
          </ul>

          {/* Desktop right section */}
          <div className="hidden items-center gap-3 md:flex">
            {/* Three-dot More menu */}
            <div className="relative" ref={moreRef}>
              <button
                type="button"
                onClick={() => setMoreOpen(!moreOpen)}
                className={`flex h-10 w-10 items-center justify-center rounded-full transition ${
                  scrolled
                    ? "text-gray-600 hover:bg-gray-100 hover:text-[#6C2BD9]"
                    : "text-white/80 hover:bg-white/10 hover:text-white"
                }`}
                aria-label="More options"
                aria-expanded={moreOpen}
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                  <circle cx="10" cy="4" r="1.5" />
                  <circle cx="10" cy="10" r="1.5" />
                  <circle cx="10" cy="16" r="1.5" />
                </svg>
              </button>

              {moreOpen && (
                <div className={`absolute right-0 top-12 w-56 rounded-2xl border shadow-xl ${
                  scrolled
                    ? "border-gray-200 bg-white"
                    : "border-white/20 bg-[#2E1065]/95 backdrop-blur-xl"
                }`}>
                  {isAuthenticated ? (
                    <div className="p-2">
                      <div className={`rounded-xl px-3 py-2.5 ${
                        scrolled ? "bg-violet-50" : "bg-white/10"
                      }`}>
                        <p className={`text-sm font-semibold ${
                          scrolled ? "text-[#6C2BD9]" : "text-white"
                        }`}>{profile.name}</p>
                        <p className={`text-xs ${
                          scrolled ? "text-violet-500" : "text-white/60"
                        }`}>{getRoleBadge(profile.role)}</p>
                      </div>
                      <div className="mt-1 space-y-0.5">
                        {portalLinks.map((link) => (
                          <Link
                            key={link.href}
                            href={link.href}
                            onClick={() => setMoreOpen(false)}
                            className={`block rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                              scrolled
                                ? "text-gray-700 hover:bg-violet-50 hover:text-[#6C2BD9]"
                                : "text-white/80 hover:bg-white/10 hover:text-white"
                            }`}
                          >
                            {link.label}
                          </Link>
                        ))}
                        <button
                          onClick={handleSignOut}
                          className={`block w-full rounded-xl px-3 py-2.5 text-left text-sm font-medium transition ${
                            scrolled
                              ? "text-red-600 hover:bg-red-50"
                              : "text-red-300 hover:bg-white/10"
                          }`}
                        >
                          Logout
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-2">
                      <Link
                        href="/login"
                        onClick={() => setMoreOpen(false)}
                        className={`block rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                          scrolled
                            ? "text-gray-700 hover:bg-violet-50 hover:text-[#6C2BD9]"
                            : "text-white/80 hover:bg-white/10 hover:text-white"
                        }`}
                      >
                        Staff Login
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Order Now CTA */}
            <Link
              href="/canteens"
              className="rounded-full bg-[#6C2BD9] px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#6C2BD9]/25 transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#F4C542] hover:text-[#2E1065] hover:shadow-[#F4C542]/30"
            >
              Order Now
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button
            type="button"
            className={`relative z-50 flex h-10 w-10 items-center justify-center rounded-xl md:hidden ${
              scrolled || menuOpen ? "text-[#6C2BD9]" : "text-white"
            }`}
            onClick={() => setMenuOpen((prev) => !prev)}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
          >
            <span className="sr-only">{menuOpen ? "Close menu" : "Open menu"}</span>
            <div className="flex w-5 flex-col gap-1.5">
              <span className={`block h-0.5 w-full rounded-full bg-current transition-all duration-300 ${
                menuOpen ? "translate-y-2 rotate-45" : ""
              }`} />
              <span className={`block h-0.5 w-full rounded-full bg-current transition-all duration-300 ${
                menuOpen ? "opacity-0" : ""
              }`} />
              <span className={`block h-0.5 w-full rounded-full bg-current transition-all duration-300 ${
                menuOpen ? "-translate-y-2 -rotate-45" : ""
              }`} />
            </div>
          </button>
        </nav>
      </header>

      {/* Mobile drawer */}
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
                ORDER | PICKUP | ENJOY
              </p>
            </div>
          </div>

          <ul className="flex flex-1 flex-col gap-1 px-4 py-6" role="list">
            {customerLinks.map((link) => {
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
            {/* Portal links for authenticated staff */}
            {portalLinks.length > 0 && (
              <li className="mt-3 border-t border-gray-100 pt-3">
                <p className="mb-2 px-4 text-xs font-semibold uppercase tracking-wider text-gray-400">Staff</p>
              </li>
            )}
            {portalLinks.map((link) => {
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
            {isAuthenticated ? (
              <>
                <div className="rounded-xl bg-[#F3EDFF] px-4 py-2 text-center">
                  <p className="text-sm font-semibold text-[#6C2BD9]">{profile.name}</p>
                  <p className="text-xs text-violet-500">{getRoleBadge(profile.role)}</p>
                </div>
                <button
                  onClick={handleSignOut}
                  className="rounded-full border border-[#6C2BD9] px-5 py-3 text-center text-sm font-semibold text-[#6C2BD9] transition-colors hover:bg-[#6C2BD9]/5"
                >
                  Logout
                </button>
              </>
            ) : (
              <Link
                href="/login"
                onClick={() => setMenuOpen(false)}
                className="rounded-full border border-gray-300 px-5 py-3 text-center text-sm font-semibold text-gray-500 transition-colors hover:bg-gray-50"
              >
                Staff Login
              </Link>
            )}
              <Link
                href="/canteens"
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
