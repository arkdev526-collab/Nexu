import Link from "next/link";
import { site } from "@/data/products";
import { Container } from "./Container";

const navItems = [
  { href: "/#featured-apps", label: "Apps" },
  { href: "/nexunotepad", label: "NexuNotePad" },
  { href: "/nexuclean", label: "NexuClean" },
  { href: "/downloads", label: "Downloads" },
  { href: "/support", label: "Support" },
];

export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-[rgba(198,238,213,0.12)] bg-[#050807]/88 backdrop-blur-xl">
      <Container className="flex min-h-16 items-center justify-between gap-4">
        <Link
          className="group flex items-center gap-3 rounded-lg py-2 pr-2"
          href="/"
          aria-label="Nexu Apps home"
        >
          <span className="grid h-9 w-9 place-items-center rounded-lg border border-[#74f7bf]/30 bg-[#74f7bf]/10 text-sm font-black text-[#74f7bf]">
            N
          </span>
          <span className="hidden text-sm font-bold text-white sm:inline">
            {site.name}
          </span>
        </Link>

        <nav aria-label="Primary navigation" className="hidden md:block">
          <ul className="flex items-center gap-1">
            {navItems.map((item) => (
              <li key={item.href}>
                <Link
                  className="rounded-lg px-3 py-2 text-sm font-medium text-[#c9d9d0] transition hover:bg-white/6 hover:text-white"
                  href={item.href}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <Link
          className="inline-flex min-h-10 items-center justify-center rounded-lg border border-[#74f7bf]/34 bg-[#74f7bf]/10 px-4 text-sm font-semibold text-[#a8ffd7] transition hover:bg-[#74f7bf]/16"
          href="/downloads"
        >
          Downloads
        </Link>
      </Container>
    </header>
  );
}
