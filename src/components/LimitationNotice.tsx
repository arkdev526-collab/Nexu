type LimitationNoticeProps = {
  title: string;
  intro?: string;
  items: string[];
};

export function LimitationNotice({ title, intro, items }: LimitationNoticeProps) {
  return (
    <section className="rounded-lg border border-[#f6b35d]/28 bg-[rgba(246,179,93,0.09)] p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">{title}</h2>
          {intro ? (
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#f2d8b6]">
              {intro}
            </p>
          ) : null}
        </div>
        <span className="inline-flex w-fit rounded-md border border-[#f6b35d]/34 bg-[#f6b35d]/10 px-3 py-1 text-xs font-semibold text-[#ffd49d]">
          Read before installing
        </span>
      </div>
      <ul className="mt-5 grid gap-3 text-sm leading-6 text-[#f6e5cf] sm:grid-cols-2">
        {items.map((item) => (
          <li className="flex gap-3" key={item}>
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#f6b35d]" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
