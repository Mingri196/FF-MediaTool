import { describe, it, expect } from "vitest";
import {
  buildGifSplitArgs,
  buildGifCombineArgs,
  buildConcatListContent,
  parseTrailingNumber,
  sortByTrailingNumber,
} from "./builder";

describe("GIF 拆分/合成命令构建（v0.83）", () => {
  it("拆分模式：GIF → PNG 序列，输出 `base-%02d.png`，保留全部帧（-fps_mode vfr）", () => {
    const { args, outputPattern } = buildGifSplitArgs("D:/in/demo.gif", "D:/out");
    expect(outputPattern).toBe("D:/out/demo-%02d.png");
    expect(args).toEqual(["-i", "D:/in/demo.gif", "-fps_mode", "vfr", "D:/out/demo-%02d.png"]);
  });

  it("拆分模式：无输出目录时回落输入文件目录", () => {
    const { outputPattern } = buildGifSplitArgs("D:/in/demo.gif", "");
    expect(outputPattern).toBe("D:/in/demo-%02d.png");
  });

  it("合成模式：concat demuxer 列表 + 帧率/循环/颜色参数", () => {
    const args = buildGifCombineArgs("D:/out/_combine_1.txt", "D:/out/anim.gif", 0, 128);
    // concat demuxer 单输入
    expect(args).toContain("-f");
    expect(args).toContain("concat");
    expect(args).toContain("-i");
    expect(args[args.indexOf("-i") + 1]).toBe("D:/out/_combine_1.txt");
    // 颜色限制 → palettegen/paletteuse
    const vf = args[args.indexOf("-vf") + 1];
    expect(vf).toContain("palettegen=max_colors=128");
    expect(args).toContain("-loop");
    expect(args[args.indexOf("-loop") + 1]).toBe("0");
    expect(args[args.length - 1]).toBe("D:/out/anim.gif");
  });

  it("合成模式：colors=256 时不加 palette 滤镜", () => {
    const args = buildGifCombineArgs("D:/out/l.txt", "D:/out/anim.gif", -1, 256);
    expect(args).not.toContain("-vf");
    expect(args[args.indexOf("-loop") + 1]).toBe("-1");
  });

  it("buildConcatListContent：每帧 file + duration（1/fps），路径转正斜杠", () => {
    const content = buildConcatListContent(
      ["D:\\in\\img-01.png", "D:\\in\\img-02.png"],
      10,
    );
    expect(content).toContain("file 'D:/in/img-01.png'");
    expect(content).toContain("file 'D:/in/img-02.png'");
    expect(content).toContain("duration 0.100000");
  });

  it("parseTrailingNumber：支持 1 / 01 / 001，无数字返回 null", () => {
    expect(parseTrailingNumber("img-01.png")).toBe(1);
    expect(parseTrailingNumber("frame001.jpg")).toBe(1);
    expect(parseTrailingNumber("pic 42.png")).toBe(42);
    expect(parseTrailingNumber("no_number.png")).toBeNull();
  });

  it("sortByTrailingNumber：按序号升序，无序号图片排最前", () => {
    const items = [
      { name: "img-03.png" },
      { name: "no_num.png" },
      { name: "img-01.png" },
      { name: "img-02.png" },
    ];
    const sorted = sortByTrailingNumber(items).map((x) => x.name);
    expect(sorted).toEqual(["no_num.png", "img-01.png", "img-02.png", "img-03.png"]);
  });
});
