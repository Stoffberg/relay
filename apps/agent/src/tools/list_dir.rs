use anyhow::Result;
use std::fs;
use std::path::Path;

pub async fn execute(path: &str) -> Result<String> {
    super::validate_path(path)?;
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
            let target = std::fs::read_link(entry.path())
                .map(|t| t.display().to_string())
                .unwrap_or_else(|_| "?".to_string());
            entries.push(format!("  {} -> {}", name, target));
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

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn test_dir() -> TempDir {
        tempfile::tempdir_in(std::env::var("HOME").unwrap()).unwrap()
    }

    #[tokio::test]
    async fn list_dir_files_and_subdirs() {
        let dir = test_dir();
        std::fs::write(dir.path().join("file.txt"), "content").unwrap();
        std::fs::create_dir(dir.path().join("subdir")).unwrap();
        let result = execute(dir.path().to_str().unwrap()).await.unwrap();
        assert!(result.contains("file.txt"));
        assert!(result.contains("subdir/"));
    }

    #[tokio::test]
    async fn list_dir_shows_sizes() {
        let dir = test_dir();
        std::fs::write(dir.path().join("small.txt"), "hi").unwrap();
        let result = execute(dir.path().to_str().unwrap()).await.unwrap();
        assert!(result.contains("small.txt (2B)"));
    }

    #[tokio::test]
    async fn list_dir_sorted_case_insensitive() {
        let dir = test_dir();
        std::fs::write(dir.path().join("Zulu.txt"), "").unwrap();
        std::fs::write(dir.path().join("alpha.txt"), "").unwrap();
        std::fs::write(dir.path().join("Beta.txt"), "").unwrap();
        let result = execute(dir.path().to_str().unwrap()).await.unwrap();
        let lines: Vec<&str> = result.lines().skip(1).collect();
        assert!(lines[0].contains("alpha.txt"));
        assert!(lines[1].contains("Beta.txt"));
        assert!(lines[2].contains("Zulu.txt"));
    }

    #[tokio::test]
    async fn list_dir_nonexistent() {
        let dir = test_dir();
        let path = dir.path().join("nope");
        let err = execute(path.to_str().unwrap()).await.unwrap_err();
        assert!(err.to_string().contains("not found") || err.to_string().contains("Directory not found"));
    }

    #[tokio::test]
    async fn list_dir_on_file() {
        let dir = test_dir();
        let path = dir.path().join("file.txt");
        std::fs::write(&path, "content").unwrap();
        let err = execute(path.to_str().unwrap()).await.unwrap_err();
        assert!(err.to_string().contains("Not a directory"));
    }

    #[tokio::test]
    async fn list_dir_empty() {
        let dir = test_dir();
        let result = execute(dir.path().to_str().unwrap()).await.unwrap();
        let lines: Vec<&str> = result.lines().collect();
        assert_eq!(lines.len(), 1);
        assert!(result.contains(":"));
    }

    #[test]
    fn format_size_bytes() {
        assert_eq!(format_size(500), "500B");
    }

    #[test]
    fn format_size_kb() {
        assert_eq!(format_size(2048), "2.0KB");
    }

    #[test]
    fn format_size_mb() {
        assert_eq!(format_size(5 * 1024 * 1024), "5.0MB");
    }
}
