// AXION-9 desktop shell — Tauri v2 entrypoint.
// Exposes real system telemetry via the `sysinfo` crate; the web build
// synthesizes equivalent metrics from pipeline telemetry instead.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;
use sysinfo::System;

#[derive(Serialize)]
pub struct SystemMetrics {
    pub cpu_usage: f32,
    pub ram_used_mb: u64,
    pub ram_total_mb: u64,
    pub core_count: usize,
    pub uptime_secs: u64,
}

#[tauri::command]
fn system_metrics() -> SystemMetrics {
    let mut sys = System::new_all();
    sys.refresh_all();
    SystemMetrics {
        cpu_usage: sys.global_cpu_usage(),
        ram_used_mb: sys.used_memory() / 1_048_576,
        ram_total_mb: sys.total_memory() / 1_048_576,
        core_count: sys.cpus().len(),
        uptime_secs: System::uptime(),
    }
}

#[tauri::command]
fn kernel_identity() -> String {
    format!("axion-tauri {} · rust {}", env!("CARGO_PKG_VERSION"), rustc_version())
}

fn rustc_version() -> &'static str {
    "stable"
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![system_metrics, kernel_identity])
        .run(tauri::generate_context!())
        .expect("error while running AXION-9 shell");
}
