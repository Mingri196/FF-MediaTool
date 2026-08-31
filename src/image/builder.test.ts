import { describe, expect, it } from "vitest";
import { buildImageArgs, genOutputPath } from "./builder";
import { defaultImageParams, type ImageParams } from "./types";

const INPUT = "photo.jpg";
const OUTPUT = "out.png";

function build(overrides?: Partial<ImageParams>): string[] {
  return buildImageArgs({ ...defaultImageParams(), ...overrides }, INPUT, OUTPUT);
}

describe("buildImageArgs", () => {
  it("基础 JPEG → PNG 转换", () => {
    const args = build({ format: "png" });
    expect(args).toContain("-c:v");
    expect(args).toContain("png");
    expect(args).toContain("-i");
    expect(args).toContain(INPUT);
    expect(args).toContain(OUTPUT);
  });

  it("JPEG 输出质量参数", () => {
    const args = build({ format: "jpg", quality: 85 });
    expect(args).toContain("mjpeg");
    // 85 → q=31-(85/100*29)=31-24.65≈6
    expect(args).toContain("6");
  });

  it("JPEG 渐进式 + 色度采样", () => {
    const args = build({ format: "jpg", progressive: true, chromaSampling: "4:4:4" });
    expect(args).toContain("+ilme+ildct");
    expect(args).toContain("yuv444p");
  });

  it("PNG 压缩级别", () => {
    const args = build({ format: "png", compressionLevel: 9 });
    expect(args).toContain("-compression_level");
    expect(args).toContain("9");
  });

  it("WebP 质量 + 无损模式", () => {
    const args = build({ format: "webp", quality: 80, lossless: true });
    expect(args).toContain("-lossless");
    expect(args).toContain("1");
    expect(args).toContain("libwebp_anim");
  });

  it("AVIF 参数", () => {
    const args = build({ format: "avif", quality: 75, avifSpeed: 4, avifDepth: 10 });
    // libaom-av1（essentials 版无 libsvtav1）
    expect(args).toContain("libaom-av1");
    expect(args).toContain("-crf");
    expect(args).not.toContain("libsvtav1");
    expect(args).toContain("-cpu-used");
    expect(args).toContain("4");
    expect(args).toContain("-pix_fmt");
    expect(args).toContain("yuv420p10le");
  });

  it("AVIF 无损模式用 -crf 0（libaom-av1 忽略 -lossless）", () => {
    const args = build({ format: "avif", lossless: true });
    expect(args).toContain("libaom-av1");
    expect(args).toContain("-crf");
    expect(args).toContain("0");
    expect(args).not.toContain("-lossless");
  });

  it("等比缩放 50%", () => {
    const args = build({ resize: { mode: "percent", value: 50, value2: 0, dpi: 72, adaptMode: "fill" } });
    const vf = args[args.indexOf("-vf") + 1];
    expect(vf).toContain("scale=iw*50/100:ih*50/100");
  });

  it("固定尺寸拉伸", () => {
    const args = build({ resize: { mode: "fixed", value: 1920, value2: 1080, dpi: 72, adaptMode: "fill" } });
    const vf = args[args.indexOf("-vf") + 1];
    expect(vf).toMatch(/scale=1920:1080/);
  });

  it("裁剪", () => {
    const args = build({ crop: { enabled: true, w: 640, h: 480, x: 10, y: 20, aspectRatio: "16:9" } });
    const vf = args[args.indexOf("-vf") + 1];
    expect(vf).toContain("crop=640:480:10:20");
  });

  it("旋转 90°", () => {
    const args = build({ rotate: 90 });
    const vf = args[args.indexOf("-vf") + 1];
    expect(vf).toContain("transpose=1");
  });

  it("色彩调整", () => {
    const args = build({ color: { brightness: 0.1, contrast: 1.2, saturation: 1.5 } });
    const vf = args[args.indexOf("-vf") + 1];
    expect(vf).toContain("eq=brightness=0.10:contrast=1.20:saturation=1.50");
  });

  it("画布扩展", () => {
    const args = build({ canvas: { enabled: true, w: 1920, h: 1080, bgColor: "#000000" } });
    const vf = args[args.indexOf("-vf") + 1];
    expect(vf).toContain("pad=1920:1080");
  });

  it("完整滤镜链顺序", () => {
    const args = build({
      crop: { enabled: true, w: 100, h: 100, x: 0, y: 0, aspectRatio: "1:1" },
      resize: { mode: "fitWidth", value: 800, value2: 0, dpi: 72, adaptMode: "fill" },
      rotate: 90,
      flipH: true,
      color: { brightness: 0, contrast: 1, saturation: 1.2 },
    });
    const vf = args[args.indexOf("-vf") + 1];
    // 顺序：crop,scale,transpose,hflip,eq
    const parts = vf.split(",");
    expect(parts[0]).toContain("crop=");
    expect(parts[1]).toContain("scale=");
    expect(parts[2]).toContain("transpose=");
    expect(parts[3]).toContain("hflip");
    expect(parts[4]).toContain("eq=");
  });
});

describe("genOutputPath", () => {
  it("生成输出路径", () => {
    const p = genOutputPath("C:/photos/vacation.jpg", "png", 0, "", "", 1, "C:/out");
    expect(p).toContain("vacation_001.png");
  });

  it("前缀+后缀+序号", () => {
    const p = genOutputPath("img.jpg", "webp", 2, "pre_", "_suf", 10, "");
    expect(p).toContain("pre_img_suf_012.webp");
  });
});