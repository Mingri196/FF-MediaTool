//! FFmpeg `-progress pipe:1` 输出的解析器。
//!
//! FFmpeg 会机器可读地把进度写入 stdout，格式为 key=value 块：
//! ```text
//! frame=123
//! out_time_us=1234567
//! speed=1.23x
//! progress=continue
//! ```
//! 块与块之间以空行分隔，`progress=end` 表示结束。
//!
//! 不依赖任何外部 crate，纯状态机解析，可单元测试。

use crate::task::model::TaskProgress;

/// 解析 `out_time` 字符串 `HH:MM:SS.ffffff`（老版本 ffmpeg 的 -progress 输出项）
fn parse_out_time_str(s: &str) -> Option<i64> {
    let mut parts = s.trim().split(':');
    let h: i64 = parts.next()?.trim().parse().ok()?;
    let m: i64 = parts.next()?.trim().parse().ok()?;
    let sec: f64 = parts.next()?.trim().parse().ok()?;
    Some((h * 3600 + m * 60) * 1000 + (sec * 1000.0) as i64)
}

/// 解析 `speed=1.23x` / `speed=N/A`
fn parse_speed(s: &str) -> f64 {
    let s = s.trim().trim_end_matches('x').trim();
    s.parse::<f64>().unwrap_or(0.0)
}

/// 累积解析器：逐块喂入 stdout 行，块结束时输出最新进度。
#[derive(Debug, Default)]
pub struct ProgressParser {
    /// 当前块内最近的值
    out_time_ms: Option<i64>,
    speed: Option<f64>,
}

impl ProgressParser {
    pub fn new() -> Self {
        Self::default()
    }

    /// 喂入一行 stdout 文本；若该行结束一个进度块（progress=end/continue），
    /// 返回该块的进度；否则返回 None（继续累积）。
    pub fn feed_line(&mut self, line: &str) -> Option<TaskProgress> {
        let ln = line.trim_end();
        if ln.is_empty() {
            // 空行 = 块分隔（ffmpeg 在 progress 块之间空一行）
            return self.settle();
        }
        let (key, value) = match ln.split_once('=') {
            Some((k, v)) => (k.trim(), v.trim()),
            None => return None,
        };
        match key {
            "out_time_us" => {
                if let Ok(v) = value.parse::<i64>() {
                    self.out_time_ms = Some(v / 1000);
                }
            }
            "out_time_ms" => {
                if let Ok(v) = value.parse::<i64>() {
                    self.out_time_ms = Some(v);
                }
            }
            "out_time" => {
                if let Some(ms) = parse_out_time_str(value) {
                    self.out_time_ms = Some(ms);
                }
            }
            "speed" => {
                self.speed = Some(parse_speed(value));
            }
            "progress" => {
                // progress=continue / progress=end：当前块结算
                return self.settle();
            }
            _ => {}
        }
        None
    }

    /// 结算当前块
    fn settle(&mut self) -> Option<TaskProgress> {
        // 只有拿到过 out_time 才认为有进度数据
        if self.out_time_ms.is_none() {
            return None;
        }
        let progress = TaskProgress {
            percent: -1.0, // 由调度器结合 duration 计算
            time_ms: self.out_time_ms.unwrap_or(0).max(0),
            duration_ms: 0,
            speed: self.speed.unwrap_or(0.0),
            eta_ms: -1,
        };
        // 块结算后清空，等待下一块（速度保留还是清空？ffmpeg 每块都给 speed，清空即可）
        self.speed = None;
        Some(progress)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_modern_block_with_us() {
        let mut p = ProgressParser::new();
        assert!(p.feed_line("frame=100").is_none());
        assert!(p.feed_line("out_time_us=32000000").is_none());
        assert!(p.feed_line("speed=2.5x").is_none());
        let r = p.feed_line("progress=continue").expect("block settles");
        assert_eq!(r.time_ms, 32_000);
        assert_eq!(r.speed, 2.5);
    }

    #[test]
    fn parses_legacy_ms_and_time_string() {
        let mut p = ProgressParser::new();
        p.feed_line("out_time_ms=65000");
        assert_eq!(p.feed_line("progress=continue").unwrap().time_ms, 65_000);

        let mut p2 = ProgressParser::new();
        p2.feed_line("out_time=00:01:05.500000");
        let r = p2.feed_line("progress=continue").unwrap();
        assert_eq!(r.time_ms, 65_500);
    }

    #[test]
    fn end_flag_settles() {
        let mut p = ProgressParser::new();
        p.feed_line("out_time_ms=1000");
        assert!(p.feed_line("progress=end").is_some());
        // 结算后无数据可重复结算
        let mut p2 = ProgressParser::new();
        assert!(p2.feed_line("").is_none());
        p2.feed_line("speed=1.0x");
        // 没有 out_time 的块不产出进度
        assert!(p2.feed_line("progress=continue").is_none());
    }

    #[test]
    fn speed_not_available() {
        let mut p = ProgressParser::new();
        p.feed_line("out_time_ms=500");
        p.feed_line("speed=N/A");
        let r = p.feed_line("progress=continue").unwrap();
        assert_eq!(r.speed, 0.0);
    }
}
