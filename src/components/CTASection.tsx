import { ButtonLink } from "./ButtonLink";

type CTASectionProps = {
  title: string;
  description: string;
  actions: {
    label: string;
    href: string;
    external?: boolean;
    variant?: "primary" | "secondary";
  }[];
};

export function CTASection({ title, description, actions }: CTASectionProps) {
  return (
    <section className="rounded-lg border border-[rgba(198,238,213,0.14)] bg-[linear-gradient(135deg,rgba(116,247,191,0.11),rgba(246,179,93,0.08)_58%,rgba(255,255,255,0.03))] p-6 sm:p-8">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-bold text-white sm:text-3xl">{title}</h2>
          <p className="mt-3 text-base leading-7 text-[#c9d9d0]">{description}</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row lg:shrink-0">
          {actions.map((action) => (
            <ButtonLink key={action.label} {...action} />
          ))}
        </div>
      </div>
    </section>
  );
}
