import Link from "next/link";
import { Container } from "./Container";
import { site } from "@/data/products";

const links = [
  { href: "/nexunotepad", label: "NexuNotePad" },
  { href: "/nexuclean", label: "NexuClean" },
  { href: "/downloads", label: "Downloads" },
  { href: "/support", label: "Support" },
];

export function Footer() {
  return (
    <footer className="border-t border-[rgba(198,238,213,0.12)] bg-[#030504]">
      <Container className="flex flex-col gap-6 py-8 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-white">{site.name}</p>
          <p className="mt-1 text-sm text-[#a7b7ad]">
            Product hub by {site.company}.
          </p>
        </div>
        <nav aria-label="Footer navigation">
          <ul className="flex flex-wrap gap-3 text-sm text-[#c9d9d0]">
            {links.map((link) => (
              <li key={link.href}>
                <Link className="rounded-lg px-2 py-1 hover:text-white" href={link.href}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </Container>
    </footer>
  );
}
