use std::sync::mpsc::{channel, Sender};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

static PAINT_SENDER: Mutex<Option<Sender<()>>> = Mutex::new(None);

#[tauri::command]
fn first_paint_ready() {
    if let Some(sender) = PAINT_SENDER.lock().unwrap().take() {
        let _ = sender.send(());
    }
}

fn compute_stats(deltas: &[u128]) -> (u128, u128, u128, u128) {
    let first = deltas[0];
    let worst = *deltas.iter().max().unwrap_or(&0);
    let mut sorted = deltas.to_vec();
    sorted.sort();
    let median = sorted[sorted.len() / 2];
    let avg = (deltas.iter().sum::<u128>()) / (deltas.len() as u128);
    (first, median, worst, avg)
}

fn print_decision(median: u128) {
    println!("\n--------------------------------------------------------------------------------");
    println!(">>> EVALUATION AGAINST DECISION RULE <<<");
    if median < 250 {
        println!("✅ VERDICT: UNDER 250 ms (Median: {} ms)", median);
        println!("   Recommendation: KEEP the React drawer, with hover pre-creation.");
        println!("   Lag is completely imperceptible to users.");
    } else if median <= 500 {
        println!("⚠️ VERDICT: 250 - 500 ms (Median: {} ms)", median);
        println!("   Recommendation: KEEP only with hover pre-creation, and test whether that hides the delay.");
    } else {
        println!("❌ VERDICT: OVER 500 ms (Median: {} ms)", median);
        println!("   Recommendation: RUN Spike D and build the drawer natively (Slint / egui).");
    }
    println!("--------------------------------------------------------------------------------\n");
}

fn run_benchmark_suite(app_handle: AppHandle) {
    thread::sleep(Duration::from_millis(1500));

    println!("================================================================================");
    println!("     WINUTILX — COLD-OPEN LATENCY BENCHMARK SUITE (TAURI V2 WEBVIEW2)");
    println!("================================================================================");
    println!("Start: Instant::now() in Rust at creation trigger");
    println!("End:   requestAnimationFrame after mount (first visual paint)");
    println!("Runs:  10 runs per page (Run 1 = Cold Cache, Runs 2..10 = Warm OS Cache)");
    println!("================================================================================\n");

    let pages = [
        ("BLANK BASELINE (dist/blank.html)", "blank.html"),
        ("REAL DRAWER UI (dist/drawer.html)", "drawer.html"),
    ];

    let mut all_results: Vec<(&str, Vec<u128>)> = Vec::new();

    for (page_title, page_file) in &pages {
        println!(">>> TESTING: {} <<<", page_title);
        let mut deltas: Vec<u128> = Vec::new();

        for i in 1..=10 {
            let (tx, rx) = channel();
            *PAINT_SENDER.lock().unwrap() = Some(tx);

            let t0 = Instant::now();

            let h_create = app_handle.clone();
            let h_app = app_handle.clone();
            let page_str = page_file.to_string();
            let win_label = format!("bench_win_{}_{}", page_file.replace('.', "_"), i);
            let label_clone = win_label.clone();

            let _ = h_create.run_on_main_thread(move || {
                let _ = WebviewWindowBuilder::new(
                    &h_app,
                    &label_clone,
                    WebviewUrl::App(page_str.into()),
                )
                .title("Cold-Open Benchmark")
                .inner_size(380.0, 640.0)
                .position(100.0, 100.0)
                .visible(true)
                .build();
            });

            match rx.recv_timeout(Duration::from_secs(8)) {
                Ok(()) => {
                    let elapsed = t0.elapsed().as_millis();
                    deltas.push(elapsed);
                    let tag = if i == 1 { " (Cold Start / First Open)" } else { " (Repeat Open)" };
                    println!("  Run #{:2}: {:4} ms{}", i, elapsed, tag);
                }
                Err(_) => {
                    eprintln!("  Run #{:2}: TIMEOUT (> 8000 ms)", i);
                }
            }

            // Destroy window
            let h_destroy = app_handle.clone();
            let h_mgr = app_handle.clone();
            let label_destroy = win_label.clone();
            let _ = h_destroy.run_on_main_thread(move || {
                if let Some(w) = h_mgr.get_webview_window(&label_destroy) {
                    let _ = w.destroy();
                }
            });

            thread::sleep(Duration::from_millis(400));
        }

        let (first, median, worst, avg) = compute_stats(&deltas);
        println!("\n  --- Summary for {} ---", page_title);
        println!("  First Open (Cold Cache): {:4} ms", first);
        println!("  Median Latency:           {:4} ms", median);
        println!("  Worst-Case Latency:       {:4} ms", worst);
        println!("  Average Latency:          {:4} ms\n", avg);

        all_results.push((page_title, deltas));
    }

    // Final Comparison Table
    println!("================================================================================");
    println!("                      FINAL BENCHMARK COMPARISON TABLE");
    println!("================================================================================");
    println!("{:<35} | {:<10} | {:<10} | {:<10}", "Page Suite", "First Open", "Median", "Worst-Case");
    println!("------------------------------------+------------+------------+-----------");

    for (title, deltas) in &all_results {
        let (first, median, worst, _) = compute_stats(deltas);
        println!("{:<35} | {:4} ms    | {:4} ms    | {:4} ms", title, first, median, worst);
    }

    if let Some((_, drawer_deltas)) = all_results.last() {
        let (_, median, _, _) = compute_stats(drawer_deltas);
        print_decision(median);
    }

    println!("Benchmark complete!");
    app_handle.exit(0);
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let handle = app.handle().clone();
            thread::spawn(move || {
                run_benchmark_suite(handle);
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![first_paint_ready])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, event| {
            if let tauri::RunEvent::ExitRequested { api, .. } = event {
                api.prevent_exit();
            }
        });
}
