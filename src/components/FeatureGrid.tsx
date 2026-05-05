type FeatureGridProps = {
  items: string[];
  columns?: "two" | "three";
};

export function FeatureGrid({ items, columns = "three" }: FeatureGridProps) {
  const gridClass =
    columns === "two"
      ? "grid-cols-1 sm:grid-cols-2"
      : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";

  return (
    <div className={`grid gap-4 ${gridClass}`}>
      {items.map((item) => (
        <div
          className="rounded-lg border border-[rgba(198,238,213,0.14)] bg-[rgba(255,255,255,0.035)] p-4"
          key={item}
        >
          <div className="mb-4 grid h-9 w-9 place-items-center rounded-lg bg-[#74f7bf]/10 text-[#74f7bf]">
            <svg
              aria-hidden="true"
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
            >
              <path
                d="m5 12 4 4L19 6"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
              />
            </svg>
          </div>
          <p className="text-sm font-semibold leading-6 text-[#eef8f1]">{item}</p>
        </div>
      ))}
    </div>
  );
}
