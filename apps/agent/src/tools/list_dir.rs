use anyhow::Result;
use std::fs;
use std::path::Path;

pub async fn execute(path: &str) -> Result<String> {
    let target = Path::new(path);
    if !target.exists() {
        return Err(anyhow::anyhow!("Directory not found: {path}"));
    }
    if !target.is_dir() {
        return Err(anyhow::anyhow!("Not a directory: {path}"));
    }

    let mut entries = Vec::new();
    for entry in fs::read_dir(target)? {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().to_string();
        let ft = entry.file_type()?;
        let meta = entry.metadata().ok();
        let size = meta.map(|m| m.len()).unwrap_or(0);

        if ft.is_dir() {
            entries.push(format!("  {}/", name));
        } else if ft.is_symlink() {
            entries.push(format!("  {} -> (symlink)", name));
        } else {
            entries.push(format!("  {} ({})", name, format_size(size)));
        }
    }
    entries.sort_by(|a, b| a.to_lowercase().cmp(&b.to_lowercase()));
    Ok(format!("{}:\n{}", path, entries.join("\n")))
}

fn format_size(bytes: u64) -> String {
    if bytes < 1024 {
        format!("{bytes}B")
    } else if bytes < 1024 * 1024 {
        format!("{:.1}KB", bytes as f64 / 1024.0)
    } else {
        format!("{:.1}MB", bytes as f64 / (1024.0 * 1024.0))
    }
}
