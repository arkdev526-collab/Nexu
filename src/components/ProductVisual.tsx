export function ProductVisual() {
  return (
    <div
      className="hub-grid relative min-h-[340px] overflow-hidden rounded-lg border border-[rgba(198,238,213,0.14)] bg-[#07100c] p-5 shadow-[0_24px_100px_rgba(0,0,0,0.4)]"
      aria-hidden="true"
    >
      <div className="absolute inset-x-8 top-8 h-24 rounded-lg border border-[#74f7bf]/20 bg-[#74f7bf]/8" />
      <div className="absolute left-6 right-6 top-20 rounded-lg border border-white/12 bg-[#0d1713] shadow-2xl">
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-[#f06a6a]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#f6b35d]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#74f7bf]" />
          <span className="ml-3 h-2 w-32 rounded bg-white/16" />
        </div>
        <div className="grid min-h-56 grid-cols-[0.72fr_1.28fr]">
          <div className="border-r border-white/10 p-4">
            <span className="block h-2 w-20 rounded bg-[#74f7bf]/42" />
            <div className="mt-5 space-y-3">
              {["w-28", "w-20", "w-24", "w-16"].map((width) => (
                <span
                  className={`block h-2 rounded bg-white/14 ${width}`}
                  key={width}
                />
              ))}
            </div>
          </div>
          <div className="p-4">
            <div className="space-y-3">
              <span className="block h-2 w-24 rounded bg-[#f6b35d]/70" />
              <span className="block h-2 w-11/12 rounded bg-white/16" />
              <span className="block h-2 w-8/12 rounded bg-[#74f7bf]/40" />
              <span className="block h-2 w-10/12 rounded bg-white/16" />
              <span className="block h-2 w-7/12 rounded bg-white/16" />
            </div>
            <div className="mt-8 rounded-lg border border-[#74f7bf]/18 bg-[#74f7bf]/8 p-4">
              <span className="block h-2 w-24 rounded bg-[#74f7bf]/50" />
              <span className="mt-3 block h-2 w-full rounded bg-white/14" />
              <span className="mt-3 block h-2 w-9/12 rounded bg-white/14" />
            </div>
          </div>
        </div>
      </div>
      <div className="absolute bottom-5 right-5 rounded-lg border border-[#f6b35d]/25 bg-[#f6b35d]/12 px-4 py-3 text-sm font-bold text-[#ffd49d]">
        Public Beta
      </div>
    </div>
  );
}
