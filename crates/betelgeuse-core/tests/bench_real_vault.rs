//! Timings against a real workspace (read-only): `BETELGEUSE_BENCH=~/Documents/betelgeuse cargo test -p betelgeuse-core --release --test bench_real_vault -- --ignored --nocapture`
use betelgeuse_core::vault;
use std::path::PathBuf;
use std::time::Instant;

#[test]
#[ignore]
fn timings() {
    let Ok(dir) = std::env::var("BETELGEUSE_BENCH") else { return };
    let ws = PathBuf::from(dir);
    let t = Instant::now();
    let notes = vault::list_notes(&ws);
    println!("list_notes: {} pages in {:?}", notes.len(), t.elapsed());
    let t = Instant::now();
    let n = vault::list_notes(&ws).len();
    println!("list_notes (warm): {n} in {:?}", t.elapsed());
    let t = Instant::now();
    let hits = vault::search(&ws, "content");
    println!("search: {} hits in {:?}", hits.len(), t.elapsed());
    let t = Instant::now();
    let b = vault::backlinks(&ws, "Areas/Content Studio.md");
    println!("backlinks: {} in {:?}", b.len(), t.elapsed());
    let t = Instant::now();
    let rows = vault::database_rows(&ws, "Areas/Content Studio/StudioDB.md").unwrap();
    println!("database_rows: {} in {:?}", rows.len(), t.elapsed());
}
