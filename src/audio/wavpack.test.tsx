// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, fireEvent, cleanup, act } from "@testing-library/react";
import { AUDIO_FORMATS, formatValue, extOfValue } from "@/audio/formatPresets";
import { buildAudioArgs, encodeArgs, wavpackCompatFilter } from "@/audio/builder";
import { defaultAudioParams, type AudioParams } from "@/audio/types";
import { deriveOutputPath, replaceExt } from "@/lib/format";
import { AudioConvertPage } from "@/pages/AudioConvertPage";
import { zh } from "@/i18n/locales/zh";
import { en } from "@/i18n/locales/en";

afterEach(cleanup);

// 顶层 mock：dict 可全局切换（zh/en）
vi.mock("@/i18n", () => ({
  useI18n: () => ({
    t: (key: string) => (globalThis as unknown as { __DICT?: Record<string, string> }).__DICT?.[key] ?? key,
    lang: (globalThis as unknown as { __DICT?: Record<string, string> }).__DICT === en ? "en" : "zh",
  }),
}));

vi.mock("@/tabs/TabManager", () => ({
  useTabManager: () => ({
    tabs: [], activeId: "", openTab: vi.fn(), closeTab: vi.fn(), duplicateTab: vi.fn(),
    activate: vi.fn(), setTabPage: vi.fn(), registerSnapshot: vi.fn(() => () => {}),
  }),
  useTabId: () => "test-tab",
  useTabInitialState: () => undefined,
  useRegisterPageSnapshot: () => {},
}));

const useZh = () => { (globalThis as unknown as { __DICT?: Record<string, string> }).__DICT = zh; };
beforeEach(() => { (globalThis as unknown as { __DICT?: Record<string, string> }).__DICT = zh; });

vi.mock("@/settings/SettingsProvider", () => ({
  useSettings: () => ({
    settings: { presets: [], outputPaths: {}, lastOutputDir: null },
    update: () => {},
  }),
}));
vi.mock("@/tasks/TaskProvider", () => ({
  useTasks: () => ({ guardAddTask: () => {} }),
}));
vi.mock("@/lib/tauri", () => ({
  api: {
    getOptDir: async () => "C:/opt",
    mediaProbeBasic: async () => ({ ok: true, durationMs: 120000, streams: [{ codecType: "audio" }] }),
  },
}));

describe("WavPack 格式预设映射", () => {
  it("AUDIO_FORMATS 中 WavPack 项：ext=wv、value=wavpack、acodec=wavpack、label=afmt.wv", () => {
    const wv = AUDIO_FORMATS.find((f) => f.ext === "wv")!;
    expect(wv).toBeTruthy();
    expect(wv.value).toBe("wavpack");
    expect(wv.acodec).toBe("wavpack");
    expect(wv.label).toBe("afmt.wv");
    expect(wv.lossless).toBe(true);
  });

  it("formatValue：wavpack 项返回 wavpack，其余格式返回 ext（无副作用）", () => {
    expect(formatValue(AUDIO_FORMATS.find((f) => f.ext === "wv")!)).toBe("wavpack");
    for (const f of AUDIO_FORMATS.filter((x) => x.ext !== "wv")) {
      expect(formatValue(f)).toBe(f.ext);
    }
  });

  it("extOfValue：wavpack → wv；其它 value 原样返回", () => {
    expect(extOfValue("wavpack")).toBe("wv");
    expect(extOfValue("mp3")).toBe("mp3");
    expect(extOfValue("flac")).toBe("flac");
    expect(extOfValue("unknown")).toBe("unknown");
  });
});

describe("WavPack ffmpeg 编码器参数", () => {
  it("buildAudioArgs 使用 -c:a wavpack（不允许出现 wv 作为编码器），并附加 asetnsamples 兼容滤镜", () => {
    const a: AudioParams = { ...defaultAudioParams(), acodec: "wavpack", mode: "lossless" };
    const args = buildAudioArgs({ input: "in.flac", output: "out.wv", audio: a });
    expect(args).toContain("-c:a");
    expect(args).toContain("wavpack");
    // 兼容滤镜：wavpack 对 mp3(fltp) 输入的 block size bug 规避
    expect(args.join(" ")).toContain("asetnsamples=n=1024");
    // 编码参数序列中没有 "wv" 作为编码器值
    const ci = args.indexOf("-c:a");
    expect(args[ci + 1]).toBe("wavpack");
  });

  it("wavpackCompatFilter：仅对 wavpack 附加滤镜，其余格式原样返回", () => {
    const wp: AudioParams = { ...defaultAudioParams(), acodec: "wavpack", mode: "lossless" };
    expect(wavpackCompatFilter(wp, null)).toContain("asetnsamples");
    expect(wavpackCompatFilter(wp, "volume=1.0dB")).toBe("volume=1.0dB,asetnsamples=n=1024:pad=1");
    const flac: AudioParams = { ...defaultAudioParams(), acodec: "flac", mode: "lossless" };
    expect(wavpackCompatFilter(flac, null)).toBeNull();
    const copy: AudioParams = { ...defaultAudioParams(), acodec: "copy", mode: "lossless" };
    expect(wavpackCompatFilter(copy, null)).toBeNull();
  });

  it("libopus vbr 模式输出 -b:a + -vbr on（不输出 -q:a）", () => {
    const a: AudioParams = { ...defaultAudioParams(), acodec: "libopus", mode: "vbr", vbrQuality: 5, bitrateK: 0 };
    const args = buildAudioArgs({ input: "in.wav", output: "o.opus", audio: a });
    expect(args).toContain("-b:a");
    expect(args.join(" ")).toContain("-vbr on");
    expect(args.join(" ")).not.toContain("-q:a");
  });

  it("encodeArgs 独立验证 wavpack 编码器（lossless 模式不附加码率参数）", () => {
    const a: AudioParams = { ...defaultAudioParams(), acodec: "wavpack", mode: "lossless", bitrateK: 999 };
    const out: string[] = [];
    encodeArgs(a, out);
    expect(out).toContain("wavpack");
    expect(out).not.toContain("-b:a");
  });

  it("其余格式编码器参数不受影响（flac/mp3/aac）", () => {
    const flac: AudioParams = { ...defaultAudioParams(), acodec: "flac", mode: "lossless" };
    expect(buildAudioArgs({ input: "in.flac", output: "o.flac", audio: flac })).toContain("flac");
    const mp3: AudioParams = { ...defaultAudioParams(), acodec: "libmp3lame", mode: "cbr", bitrateK: 192 };
    const mp3args = buildAudioArgs({ input: "in.wav", output: "o.mp3", audio: mp3 });
    expect(mp3args).toContain("libmp3lame");
    expect(mp3args).toContain("-b:a");
    const aac: AudioParams = { ...defaultAudioParams(), acodec: "aac", mode: "cbr", bitrateK: 192 };
    expect(buildAudioArgs({ input: "in.wav", output: "o.m4a", audio: aac })).toContain("aac");
  });
});

describe("WavPack 输出后缀映射", () => {
  it("deriveOutputPath / replaceExt：wavpack 格式 → 原名.wv（无 _out）", () => {
    // deriveOutputPath 语义：原名.新扩展（0.66 起移除 _out）
    expect(deriveOutputPath("C:/music/song.flac", extOfValue("wavpack"))).toBe("C:/music/song.wv");
    expect(replaceExt("C:/music/song_whatever.mp3", "wv")).toBe("C:/music/song_whatever.wv");
    // 关键：后缀是 wv 而不是 wavpack
    expect(deriveOutputPath("C:/music/song.flac", extOfValue("wavpack"))).not.toContain(".wavpack");
    // 关键：不出现 _out
    expect(deriveOutputPath("C:/music/song.flac", extOfValue("wavpack"))).not.toContain("_out");
  });

  it("格式名不直接作为后缀（业务路径永远走 extOfValue 映射）", () => {
    expect(extOfValue("wavpack")).toBe("wv");
    // 仅当错误地直接传裸名时才出现 .wavpack（业务代码不会这么用）
    expect(deriveOutputPath("C:/music/song.flac", "wavpack")).toBe("C:/music/song.wavpack");
  });
});

describe("音频转换页 下拉 UI 回显", () => {
  it("展开格式下拉：WavPack 项显示文本 WavPack（开源无损）；选中后 trigger 回显友好名称（非 wv）", async () => {
    useZh();
    const { container } = render(<AudioConvertPage />);
    // 格式下拉：文本为 MP3（通用有损）的 trigger
    const triggers = Array.from(
      container.querySelectorAll('[data-slot="select-trigger"]'),
    ) as HTMLElement[];
    const formatTrigger = triggers.find((el) => el.textContent?.includes("MP3"));
    expect(formatTrigger).toBeTruthy();
    fireEvent.click(formatTrigger!);
    const popup = document.querySelector('[data-slot="select-content"]') as HTMLElement;
    expect(popup).not.toBeNull();
    // 选项按文本定位（Base UI 不渲染 value 属性；WavPack 项文本来自 afmt.wv）
    const rows = Array.from(popup.querySelectorAll('[role="option"]')) as HTMLElement[];
    const wvRow = rows.find((r) => r.textContent?.includes("WavPack"));
    expect(wvRow).toBeTruthy();
    expect(wvRow!.textContent).toBe("WavPack（开源无损）");
    expect(zh["afmt.wv"]).toBe("WavPack（开源无损）");
    // 其余选项不受影响：WavPack 前仍是原有的 9 项
    expect(rows.length).toBe(10);
    // 选中 WavPack：Base UI 需要完整鼠标序列（pointerEnter → pointerDown → click detail:1）
    act(() => {
      fireEvent.pointerEnter(wvRow as HTMLElement, { pointerType: "mouse" });
      fireEvent.pointerDown(wvRow as HTMLElement, { pointerType: "mouse" });
      fireEvent.click(wvRow as HTMLElement, { pointerType: "mouse", detail: 1 });
    });
    // 回显：trigger 显示友好名称，而不是 wv
    expect(formatTrigger!.textContent).toContain("WavPack");
    expect(formatTrigger!.textContent).not.toBe("wv");
    // 关闭残留 popup（Base UI portal 不随 cleanup 清理）
    act(() => {
      fireEvent.keyDown(popup, { key: "Escape" });
    });
  });

  it("SelectValue 函数 children 按 value 解析回显友好名称", () => {
    useZh();
    // 直接测试解析逻辑：wavpack → 显示 afmt.wv 文案
    const f = AUDIO_FORMATS.find((x) => formatValue(x) === "wavpack")!;
    expect(f).toBeTruthy();
    expect(zh[f.label]).toBe("WavPack（开源无损）");
    // 其它格式仍按自身 label 回显
    const mp3 = AUDIO_FORMATS.find((x) => formatValue(x) === "mp3")!;
    expect(zh[mp3.label]).toBe("MP3（通用有损）");
  });

  it("英文环境：WavPack 回显 (lossless) 文案", () => {
    useZh();
    (globalThis as unknown as { __DICT?: Record<string, string> }).__DICT = en;
    const f = AUDIO_FORMATS.find((x) => formatValue(x) === "wavpack")!;
    expect(en[f.label]).toBe("WavPack (lossless)");
  });
});