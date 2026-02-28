use anyhow::Result;
use std::fs;
use std::path::Path;

pub async fn execute(path: &str, content: String) -> Result<String> {
    if content.len() > 10_000_000 {
        return Err(anyhow::anyhow!("Content too large ({} bytes). Maximum is 10MB.", content.len()));
    }
    super::validate_path(path)?;
    let target = Path::new(path);
    if let Some(parent) = target.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)?;
        }
    }
    let len = content.len();
    let tmp_path = format!("{}.tmp", path);
    fs::write(&tmp_path, &content)?;
    fs::rename(&tmp_path, path)?;
    Ok(format!("Wrote {} bytes to {}", len, path))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn test_dir() -> TempDir {
        tempfile::tempdir_in(std::env::var("HOME").unwrap()).unwrap()
    }

    #[tokio::test]
    async fn write_new_file() {
        let dir = test_dir();
        let path = dir.path().join("new.txt");
        let result = execute(path.to_str().unwrap(), "hello world".into()).await.unwrap();
        assert!(result.contains("11 bytes"));
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "hello world");
    }

    #[tokio::test]
    async fn write_overwrite_existing() {
        let dir = test_dir();
        let path = dir.path().join("existing.txt");
        std::fs::write(&path, "old content").unwrap();
        execute(path.to_str().unwrap(), "new content".into()).await.unwrap();
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "new content");
    }

    #[tokio::test]
    async fn write_creates_parent_dirs() {
        let dir = test_dir();
        let path = dir.path().join("a/b/c/deep.txt");
        let result = execute(path.to_str().unwrap(), "deep".into()).await.unwrap();
        assert!(result.contains("4 bytes"));
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "deep");
    }

    #[tokio::test]
    async fn write_rejects_oversized_content() {
        let dir = test_dir();
        let path = dir.path().join("big.txt");
        let content = "x".repeat(10_000_001);
        let err = execute(path.to_str().unwrap(), content).await.unwrap_err();
        assert!(err.to_string().contains("too large"));
    }

    #[tokio::test]
    async fn write_empty_file() {
        let dir = test_dir();
        let path = dir.path().join("empty.txt");
        let result = execute(path.to_str().unwrap(), String::new()).await.unwrap();
        assert!(result.contains("0 bytes"));
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "");
    }
}
