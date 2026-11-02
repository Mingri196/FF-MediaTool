import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";

/**
 * 应用版本号：运行时从 Tauri 配置读取（tauri.conf.json 的 version 指向
 * ../package.json，因此 package.json 是唯一来源，改一处全局生效）。
 * 返回带 Beta 后缀的展示文本，如 "v0.88.0 Beta"；未加载完成前为空串。
 */
export function useAppVersion(): string {
  const [version, setVersion] = useState("");
  useEffect(() => {
    getVersion()
      .then((v) => setVersion(`v${v} Beta`))
      .catch((e) => console.error(e));
  }, []);
  return version;
}
