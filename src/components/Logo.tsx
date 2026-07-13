export default function Logo({ size = "md" }: { size?: "md" | "lg" }) {
  return (
    <div className={size === "lg" ? "text-center space-y-2" : "flex items-center gap-2"}>
      <div
        className={
          "inline-flex items-center justify-center rounded-2xl bg-gradient-to-br from-[#16204a] to-[#2a3c7d] text-white font-black shadow-lg " +
          (size === "lg" ? "w-16 h-16 text-2xl" : "w-9 h-9 text-sm")
        }
      >
        正
      </div>
      <div className={size === "lg" ? "" : "leading-tight"}>
        <div className={"font-black text-[#16204a] " + (size === "lg" ? "text-2xl" : "text-[15px]")}>
          정철 VOCA
        </div>
        <div className={"font-semibold text-[color:var(--brand-gold)] " + (size === "lg" ? "text-sm" : "text-[10px]")}>
          정철어학원 청당국제캠퍼스
        </div>
      </div>
    </div>
  );
}
