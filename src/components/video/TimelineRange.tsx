import { useI18n } from "@/i18n";
import { fmtSec } from "@/video/builder";

/**
 * 双滑块时间轴：标记裁剪区间（PRD 3.2：拖拽时间轴标记裁剪区间）。
 * 两个原生 range input 叠加实现；start/end 互相约束。
 */
export function TimelineRange({
  durationSec,
  startSec,
  endSec,
  onChange,
}: {
  durationSec: number;
  startSec: number;
  endSec: number; // -1 = 到结尾
  onChange: (start: number, end: number) => void;
}) {
  const { t } = useI18n();
  const dur = Math.max(1, durationSec);
  const effectiveEnd = endSec < 0 ? dur : endSec;

  return (
    <div className="w-full">
      <div className="relative h-8">
        {/* 底部轨道 */}
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-muted" />
        {/* 选中区间高亮 */}
        <div
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-primary/70"
          style={{
            left: `${(startSec / dur) * 100}%`,
            width: `${((effectiveEnd - startSec) / dur) * 100}%`,
          }}
        />
        {/* start thumb */}
        <input
          type="range"
          min={0}
          max={dur}
          step={0.1}
          value={startSec}
          onChange={(e) => {
            const v = Math.min(Number(e.target.value), effectiveEnd - 0.1);
            onChange(v, endSec);
          }}
          className="absolute inset-x-0 top-1/2 -translate-y-1/2 cursor-pointer appearance-none bg-transparent [&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow"
          aria-label={t("timeline.start")}
        />
        {/* end thumb */}
        <input
          type="range"
          min={0}
          max={dur}
          step={0.1}
          value={effectiveEnd}
          onChange={(e) => {
            const v = Math.max(Number(e.target.value), startSec + 0.1);
            // 语义：拖到最右端 = "到结尾"（endSec=-1）；其余为具体秒数
            onChange(startSec, v >= dur - 0.05 ? -1 : v);
          }}
          className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 cursor-pointer appearance-none bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-foreground [&::-webkit-slider-thumb]:shadow"
          aria-label={t("timeline.end")}
        />
      </div>
      <div className="mt-1 flex justify-between font-mono text-xs text-muted-foreground">
        <span>0:00</span>
        <span>
          {fmtSec(startSec)} — {endSec < 0 ? t("clip.endToEnd") : fmtSec(endSec)}
        </span>
        <span>{fmtSec(dur)}</span>
      </div>
    </div>
  );
}