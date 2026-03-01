use anyhow::Result;
use std::fs;
use std::path::Path;

pub async fn execute(path: &str, content: String, overwrite: bool) -> Result<String> {
    if content.len() > 10_000_000 {
        return Err(anyhow::anyhow!("Content too large ({} bytes). Maximum is 10MB.", content.len()));
    }
    super::validate_path(path)?;
    let target = Path::new(path);
    if target.exists() && !overwrite {
        return Err(anyhow::anyhow!(
            "File already exists: {path}. Use file_edit to modify existing files, or set overwrite to true if you truly need to replace the entire file."
        ));
    }
    if let Some(parent) = target.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)?;
        }
    }
    let chars = content.chars().count();
    let tmp_path = format!("{}.tmp", path);
    if let Err(e) = fs::write(&tmp_path, &content) {
        let _ = fs::remove_file(&tmp_path);
        return Err(e.into());
    }
    if let Err(e) = fs::rename(&tmp_path, path) {
        let _ = fs::remove_file(&tmp_path);
        return Err(e.into());
    }
    Ok(format!("Wrote {} chars to {}", chars, path))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn test_dir() -> TempDir {
        tempfile::tempdir_in(std::env::var("HOME").or_else(|_| std::env::var("USERPROFILE")).unwrap()).unwrap()
    }

    #[tokio::test]
    async fn write_new_file() {
        let dir = test_dir();
        let path = dir.path().join("new.txt");
        let result = execute(path.to_str().unwrap(), "hello world".into(), false).await.unwrap();
        assert!(result.contains("11 chars"));
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "hello world");
    }

    #[tokio::test]
    async fn write_rejects_overwrite_without_flag() {
        let dir = test_dir();
        let path = dir.path().join("existing.txt");
        std::fs::write(&path, "old content").unwrap();
        let err = execute(path.to_str().unwrap(), "new content".into(), false).await.unwrap_err();
        assert!(err.to_string().contains("already exists"));
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "old content");
    }

    #[tokio::test]
    async fn write_overwrite_with_flag() {
        let dir = test_dir();
        let path = dir.path().join("existing.txt");
        std::fs::write(&path, "old content").unwrap();
        execute(path.to_str().unwrap(), "new content".into(), true).await.unwrap();
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "new content");
    }

    #[tokio::test]
    async fn write_creates_parent_dirs() {
        let dir = test_dir();
        let path = dir.path().join("a/b/c/deep.txt");
        let result = execute(path.to_str().unwrap(), "deep".into(), false).await.unwrap();
        assert!(result.contains("4 chars"));
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "deep");
    }

    #[tokio::test]
    async fn write_rejects_oversized_content() {
        let dir = test_dir();
        let path = dir.path().join("big.txt");
        let content = "x".repeat(10_000_001);
        let err = execute(path.to_str().unwrap(), content, false).await.unwrap_err();
        assert!(err.to_string().contains("too large"));
    }

    #[tokio::test]
    async fn write_empty_file() {
        let dir = test_dir();
        let path = dir.path().join("empty.txt");
        let result = execute(path.to_str().unwrap(), String::new(), false).await.unwrap();
        assert!(result.contains("0 chars"));
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "");
    }
}
