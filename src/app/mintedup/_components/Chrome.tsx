import Link from "next/link";
import { currentUser } from "@/mintedup/auth";

const NAV = [
  { href: "/mintedup/browse", label: "Browse" },
  { href: "/mintedup/browse?format=bid", label: "Auctions" },
  { href: "/mintedup/research", label: "Research" },
  { href: "/mintedup/sell", label: "Sell" },
];

export async function MuHeader() {
  const user = await currentUser();

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--mu-line)] bg-[#0c0a08]/90 backdrop-blur-xl">
      <div className="mx-auto flex min-h-16 w-full max-w-7xl items-center justify-between gap-4 px-5 sm:px-6 lg:px-8">
        <Link className="flex items-center gap-2.5" href="/mintedup" aria-label="Minted Up home">
          <span className="grid h-9 w-9 place-items-center rounded-full border border-[var(--mu-line-strong)] bg-[rgba(216,180,90,0.1)] text-sm font-bold text-[var(--mu-brass)]">
            M
          </span>
          <span className="mu-display text-lg font-semibold tracking-tight">
            Minted<span className="text-[var(--mu-brass)]">Up</span>
          </span>
        </Link>

        <nav aria-label="Minted Up" className="hidden md:block">
          <ul className="mu-sans flex items-center gap-1">
            {NAV.map((item) => (
              <li key={item.label}>
                <Link
                  className="rounded-lg px-3 py-2 text-sm font-medium text-[var(--mu-muted)] transition hover:bg-[rgba(216,180,90,0.08)] hover:text-[var(--mu-text)]"
                  href={item.href}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="mu-sans flex items-center gap-2">
          {user ? (
            <>
              {user.role === "admin" ? (
                <Link
                  className="hidden rounded-lg px-3 py-2 text-sm font-medium text-[var(--mu-verdigris)] sm:inline-block"
                  href="/mintedup/admin"
                >
                  Admin
                </Link>
              ) : null}
              <Link className="mu-btn mu-btn-ghost" href="/mintedup/dashboard">
                {user.shop.name}
              </Link>
            </>
          ) : (
            <>
              <Link
                className="hidden rounded-lg px-3 py-2 text-sm font-medium text-[var(--mu-muted)] hover:text-[var(--mu-text)] sm:inline-block"
                href="/mintedup/signin"
              >
                Sign in
              </Link>
              <Link className="mu-btn mu-btn-primary" href="/mintedup/signin?mode=register">
                Open a shop
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export function MuFooter() {
  return (
    <footer className="mt-24 border-t border-[var(--mu-line)]">
      <div className="mx-auto grid w-full max-w-7xl gap-8 px-5 py-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:px-8">
        <div>
          <p className="mu-display text-lg font-semibold">
            Minted<span className="text-[var(--mu-brass)]">Up</span>
          </p>
          <p className="mu-sans mt-2 text-sm leading-relaxed text-[var(--mu-muted)]">
            A marketplace and research gateway for antiques and collectibles. Nothing else is
            listed here.
          </p>
        </div>
        {[
          {
            title: "Marketplace",
            links: [
              { href: "/mintedup/browse", label: "Browse everything" },
              { href: "/mintedup/browse?format=bid", label: "Live auctions" },
              { href: "/mintedup/browse?format=buy", label: "Buy it now" },
            ],
          },
          {
            title: "Sellers",
            links: [
              { href: "/mintedup/sell", label: "Create a listing" },
              { href: "/mintedup/dashboard", label: "Your dashboard" },
              { href: "/mintedup/standards", label: "Photography standard" },
            ],
          },
          {
            title: "Research",
            links: [
              { href: "/mintedup/research", label: "Research gateway" },
              { href: "/mintedup/standards", label: "How it learns" },
            ],
          },
        ].map((column) => (
          <div key={column.title}>
            <p className="mu-label">{column.title}</p>
            <ul className="mu-sans space-y-2">
              {column.links.map((link) => (
                <li key={link.href + link.label}>
                  <Link
                    className="text-sm text-[var(--mu-muted)] transition hover:text-[var(--mu-brass)]"
                    href={link.href}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mu-sans border-t border-[var(--mu-line)] px-5 py-6 text-center text-xs text-[var(--mu-muted)]">
        Minted Up — antiques and collectibles only. Descriptions are written by sellers; condition
        reports are theirs, not ours.
      </div>
    </footer>
  );
}
