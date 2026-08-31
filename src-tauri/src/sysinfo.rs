use std::sync::Mutex;
use std::time::Duration;
use sysinfo::System;
use tauri::Emitter;

/// 实时硬件使用率：GPU / CPU / 内存百分比
#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SystemStats {
    /// GPU 使用率百分比（PDH 跨厂商：NVIDIA/AMD/Intel 均支持；无 GPU 时 0）
    pub gpu: u8,
    /// CPU 使用率百分比
    pub cpu: u8,
    /// 内存使用率百分比
    pub memory: u8,
}

// 跨调用保持 System 实例（CPU 使用率需要至少两次 refresh 采样才有值）
static SYSTEM: Mutex<Option<System>> = Mutex::new(None);

// ---------------- GPU 检测：Windows PDH 性能计数器（跨厂商） ----------------
// 使用 `\GPU Engine(*)\Utilization Percentage` 计数器：
// - 微软官方统一计数器，NVIDIA / AMD / Intel 三厂商通用（与任务管理器同源）
// - 替代原先仅支持 NVIDIA 的 nvidia-smi（AMD/Intel 恒 0%）
// 首次调用建立查询与计数器；后续每次 CollectQueryData + 读取各引擎利用率取平均。
#[cfg(windows)]
mod pdh_gpu {
    use windows::Win32::System::Performance::{
        PdhAddEnglishCounterW, PdhCollectQueryData, PdhExpandWildCardPathW, PdhGetFormattedCounterValue,
        PdhOpenQueryW, PDH_FMT_COUNTERVALUE, PDH_FMT_DOUBLE, PDH_HCOUNTER, PDH_HQUERY,
    };
    use windows::core::{PCWSTR, PWSTR};
    use std::sync::Mutex;

    const PATH: &str = "\\GPU Engine(*)\\Utilization Percentage";

    // 跨调用保持 PDH 查询与计数器列表（利用率需至少两次采样）
    // PDH 句柄内部是裸指针，非 Send/Sync；但仅在 spawn_title_updater 单后台线程访问，
    // 因此用 unsafe 包装断言 Send+Sync 是安全的。
    #[derive(Default)]
    pub struct PdhState {
        pub query: PDH_HQUERY,
        pub counters: Vec<PDH_HCOUNTER>,
        pub ready: bool,
    }
    unsafe impl Send for PdhState {}
    unsafe impl Sync for PdhState {}

    pub static PDH: Mutex<Option<PdhState>> = Mutex::new(None);

    fn to_wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    /// 首次初始化：展开 `\GPU Engine(*)\Utilization Percentage` 通配路径并添加全部计数器
    fn init() -> Option<PdhState> {
        unsafe {
            // 两阶段展开通配路径：先取长度
            let wild = to_wide(PATH);
            let mut size: u32 = 0;
            let hr = PdhExpandWildCardPathW(PCWSTR::null(), PCWSTR(wild.as_ptr()), None, &mut size, 0);
            if hr != 0 || size == 0 {
                return None;
            }
            let mut buf = vec![0u16; size as usize];
            let hr = PdhExpandWildCardPathW(PCWSTR::null(), PCWSTR(wild.as_ptr()), Some(PWSTR(buf.as_mut_ptr())), &mut size, 0);
            if hr != 0 {
                return None;
            }

            let mut query = PDH_HQUERY::default();
            let hr = PdhOpenQueryW(PCWSTR::null(), 0, &mut query);
            if hr != 0 {
                return None;
            }

            // 展开结果：多段 null 结尾字符串，末段空串结束
            let mut counters = Vec::new();
            let mut p = buf.as_ptr();
            loop {
                let mut len = 0usize;
                while *p.add(len) != 0 {
                    len += 1;
                }
                if len == 0 {
                    break;
                }
                let path = String::from_utf16_lossy(std::slice::from_raw_parts(p, len));
                let mut hcounter = PDH_HCOUNTER::default();
                let wide_path = to_wide(&path);
                // 用 PdhAddEnglishCounterW 规避本地化计数器名问题
                let hr = PdhAddEnglishCounterW(query, PCWSTR(wide_path.as_ptr()), 0, &mut hcounter);
                if hr == 0 {
                    counters.push(hcounter);
                }
                p = p.add(len + 1);
            }

            if counters.is_empty() {
                let _ = query;
                return None;
            }

            Some(PdhState { query, counters, ready: false })
        }
    }

    /// 读取 GPU 整体利用率（各引擎利用率取平均，0-100）
    pub fn read() -> u8 {
        let mut guard = PDH.lock().unwrap_or_else(|e| e.into_inner());
        if guard.is_none() {
            *guard = init();
        }
        let state = match guard.as_mut() {
            Some(s) => s,
            None => return 0,
        };

        unsafe {
            // 收集当前采样；首次调用建立基线（无值属正常）
            let hr = PdhCollectQueryData(state.query);
            if hr != 0 {
                return 0;
            }
            // 首次 collect 尚无速率可算
            if !state.ready {
                state.ready = true;
                return 0;
            }
            let mut sum = 0.0f64;
            let mut n = 0u32;
            for &hc in &state.counters {
                let mut value = PDH_FMT_COUNTERVALUE::default();
                let hr = PdhGetFormattedCounterValue(hc, PDH_FMT_DOUBLE, None, &mut value);
                if hr == 0 {
                    sum += value.Anonymous.doubleValue;
                    n += 1;
                }
            }
            if n == 0 {
                return 0;
            }
            let avg = sum / n as f64;
            avg.clamp(0.0, 100.0) as u8
        }
    }
}

#[cfg(not(windows))]
fn read_gpu() -> u8 {
    0
}

#[cfg(windows)]
fn read_gpu() -> u8 {
    pdh_gpu::read()
}

/// 读取实时硬件使用率：GPU（PDH 跨厂商）/ CPU（sysinfo 两次采样）/ 内存
pub fn read_stats() -> SystemStats {
    let mut guard = SYSTEM.lock().unwrap_or_else(|e| e.into_inner());
    if guard.is_none() {
        let mut sys = System::new();
        sys.refresh_cpu_usage(); // 首次采样建立基线（本轮返回 0 属正常）
        *guard = Some(sys);
    }
    let sys = guard.as_mut().unwrap();
    sys.refresh_cpu_usage();
    let cpu = sys.global_cpu_usage().clamp(0.0, 100.0) as u8;

    use sysinfo::MemoryRefreshKind;
    sys.refresh_memory_specifics(MemoryRefreshKind::nothing().with_ram());
    let total = sys.total_memory();
    let used = sys.used_memory();
    let memory = if total > 0 {
        (used as f64 / total as f64 * 100.0).clamp(0.0, 100.0) as u8
    } else {
        0
    };

    SystemStats {
        gpu: read_gpu(),
        cpu,
        memory,
    }
}

/// 实时硬件使用率命令（保留供前端/其他用途调用）
#[tauri::command]
pub fn system_stats() -> SystemStats {
    read_stats()
}

/// 后台任务：每 500ms 读取硬件使用率并通过事件推送到前端（自制标题栏渲染）。
/// 事件名 `hardware-stats`，负载 SystemStats（camelCase: gpu/cpu/memory）。
/// 不调用系统 set_title——标题由前端 CustomTitleBar 的 UI 文本展示。
pub fn spawn_title_updater(app: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            let stats = read_stats();
            let _ = app.emit("hardware-stats", &stats);
            tokio::time::sleep(Duration::from_millis(500)).await;
        }
    });
}
