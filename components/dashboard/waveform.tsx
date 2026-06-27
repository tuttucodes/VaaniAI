import { cn } from "@/lib/utils";

const bars = [18, 44, 28, 68, 34, 54, 22, 74, 38, 64, 26, 48, 20, 58, 32, 70, 30, 46];

export function Waveform({ className }: { className?: string }) {
  return (
    <div className={cn("flex h-12 items-center gap-1", className)} aria-hidden="true">
      {bars.map((height, index) => (
        <span
          key={`${height}-${index}`}
          className="w-1.5 rounded-full bg-primary/75"
          style={{ height: `${height}%`, opacity: 0.35 + (index % 4) * 0.14 }}
        />
      ))}
    </div>
  );
}
