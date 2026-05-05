export type ProductStatusTone = "beta" | "external" | "info";

export type ProductAction = {
  label: string;
  href: string;
  external?: boolean;
  variant?: "primary" | "secondary";
};

export type ProductDownload = {
  version: string;
  filename: string;
  sha256: string;
  platform: string;
  build: string;
  href?: string;
  notes: string[];
};

export type Product = {
  slug: "nexunotepad" | "nexuclean";
  name: string;
  path: string;
  title: string;
  summary: string;
  description: string;
  status: {
    label: string;
    tone: ProductStatusTone;
  };
  actions: ProductAction[];
  features: string[];
  limitations?: string[];
  download?: ProductDownload;
  externalUrl?: string;
  note?: string;
};

export const site = {
  name: "Nexu Apps",
  company: "Sumero Studio",
  url: "https://nexuapps.sumerostudio.com",
  description:
    "Practical Windows tools, editors, and creator software by Sumero Studio.",
};

export const nexuNotePad: Product = {
  slug: "nexunotepad",
  name: "NexuNotePad",
  path: "/nexunotepad",
  title: "Local-first code and web editor for Windows.",
  summary:
    "NexuNotePad helps you write, preview, and organise code and web files in one focused desktop workspace.",
  description:
    "A focused Windows editor for local projects, web files, templates, previews, and developer utility workflows.",
  status: {
    label: "NexuNotePad 0.5.0 Public Beta",
    tone: "beta",
  },
  actions: [
    {
      label: "Download Public Beta",
      href: "/downloads#nexunotepad",
      variant: "primary",
    },
    {
      label: "View Release Notes",
      href: "/nexunotepad#release-notes",
      variant: "secondary",
    },
  ],
  features: [
    "Local-first Windows editor",
    "Workspace and file management",
    "Monaco editor",
    "Live preview for supported file types",
    "Template Library / Template Generator",
    "GitHub public ZIP snapshot import",
    "Source Control v1 read-only status",
    "Python Tools v1 detection/counting",
    "Optional AI Assistant with user-provided OpenAI API key",
    "Welcome / Quick Start panel",
  ],
  limitations: [
    "Public Beta",
    "WebView2 Runtime may be required if not already installed",
    "PHP is not bundled",
    "PHP Preview/runtime execution is paused/not included",
    "AI requires user OpenAI API key and API quota",
    "ChatGPT subscription and OpenAI API billing are separate",
    "GitHub Import is ZIP snapshot only, not clone/sync",
    "Source Control does not commit/push/pull",
    "Python Tools do not execute scripts",
    "Accounts/Pro/payment are not active",
    "Check for Updates is informational only",
    "Installer may show a Windows trust/SmartScreen warning if unsigned/new",
  ],
  download: {
    version: "NexuNotePad 0.5.0 Public Beta",
    filename: "NexuNotePadSetup-0.5.0-x64-self-contained.exe",
    sha256:
      "CA12F90C95B221D05AF61CBFDC004736B7063167C1FD3B17EDF82D98CEA9EE12",
    platform: "Windows x64 installer",
    build: "Self-contained app build",
    notes: [
      "Windows x64 installer",
      "Self-contained app build",
      "WebView2 Runtime may still be required",
      "PHP is not bundled",
      "Optional AI requires user OpenAI API key and API quota",
    ],
  },
};

export const nexuClean: Product = {
  slug: "nexuclean",
  name: "NexuClean",
  path: "/nexuclean",
  title: "Clean smarter. Keep control.",
  summary:
    "A Windows cleaning and PC utility app built around review-before-delete safety.",
  description:
    "A professional Windows cleaner that keeps the user in control with careful review before delete.",
  status: {
    label: "Dedicated website",
    tone: "external",
  },
  actions: [
    {
      label: "Visit nexuclean.com",
      href: "https://www.nexuclean.com",
      external: true,
      variant: "primary",
    },
    {
      label: "Download Direct",
      href: "https://www.nexuclean.com/downloads/NexuClean-latest-win-x64.rar",
      external: true,
      variant: "secondary",
    },
  ],
  features: [
    "Professional Windows cleaner",
    "Review before delete",
    "Honest wording",
    "No scare tactics",
    "No fake detections",
    "No fake performance claims",
    "No fake trust badges",
  ],
  externalUrl: "https://www.nexuclean.com",
  note: "NexuClean also has its own dedicated website at nexuclean.com.",
};

export const products = [nexuNotePad, nexuClean] as const;
