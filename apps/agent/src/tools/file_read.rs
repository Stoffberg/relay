use anyhow::Result;
use std::fs;
use std::path::Path;

pub async fn execute(path: &str, offset: Option<usize>, limit: Option<usize>) -> Result<String> {
    super::validate_path(path)?;
    let target = Path::new(path);
    if !target.exists() {
        return Err(anyhow::anyhow!("File not found: {path}"));
    }

    if target.is_file() {
        let metadata = fs::metadata(target)?;
        if metadata.len() > 10_000_000 {
            return Err(anyhow::anyhow!(
                "File too large ({} bytes). Maximum supported size is 10MB.",
                metadata.len()
            ));
        }
    }

    if target.is_dir() {
        let mut entries = Vec::new();
        for entry in fs::read_dir(target)? {
            let entry = entry?;
            let name = entry.file_name().to_string_lossy().to_string();
            let is_dir = entry.file_type()?.is_dir();
            entries.push(if is_dir {
                format!("{}/", name)
            } else {
                name
            });
        }
        entries.sort();
        return Ok(entries.join("\n"));
    }

    let content = match fs::read_to_string(path) {
        Ok(c) => c,
        Err(e) if e.kind() == std::io::ErrorKind::InvalidData => {
            let size = fs::metadata(path).map(|m| m.len()).unwrap_or(0);
            return Ok(format!(
                "Binary file ({size} bytes). Use shell_exec to inspect."
            ));
        }
        Err(e) if e.kind() == std::io::ErrorKind::PermissionDenied => {
            return Err(anyhow::anyhow!("Permission denied: {path}"));
        }
        Err(e) => return Err(e.into()),
    };
    let lines: Vec<&str> = content.lines().collect();
    let start = offset.unwrap_or(0);
    let count = limit.unwrap_or(2000);
    let end = (start + count).min(lines.len());

    let numbered: Vec<String> = lines[start..end]
        .iter()
        .enumerate()
        .map(|(i, line)| format!("{}: {}", start + i + 1, line))
        .collect();

    let mut result = numbered.join("\n");
    if end < lines.len() {
        result.push_str(&format!(
            "\n\n(Showing lines {}-{} of {}. Use offset={} to continue.)",
            start + 1,
            end,
            lines.len(),
            end
        ));
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn test_dir() -> TempDir {
        tempfile::tempdir_in(std::env::var("HOME").or_else(|_| std::env::var("USERPROFILE")).unwrap()).unwrap()
    }

    #[tokio::test]
    async fn read_existing_file() {
        let dir = test_dir();
        let path = dir.path().join("hello.txt");
        std::fs::write(&path, "line one\nline two\nline three").unwrap();
        let result = execute(path.to_str().unwrap(), None, None).await.unwrap();
        assert!(result.contains("1: line one"));
        assert!(result.contains("2: line two"));
        assert!(result.contains("3: line three"));
    }

    #[tokio::test]
    async fn read_with_offset_and_limit() {
        let dir = test_dir();
        let path = dir.path().join("numbered.txt");
        let content: String = (0..10).map(|i| format!("line {i}")).collect::<Vec<_>>().join("\n");
        std::fs::write(&path, &content).unwrap();

        let result = execute(path.to_str().unwrap(), Some(2), Some(3)).await.unwrap();
        assert!(result.contains("3: line 2"));
        assert!(result.contains("4: line 3"));
        assert!(result.contains("5: line 4"));
        assert!(!result.contains("6: line 5"));
        assert!(result.contains("Use offset=5 to continue"));
    }

    #[tokio::test]
    async fn read_nonexistent_file() {
        let dir = test_dir();
        let path = dir.path().join("nope.txt");
        let err = execute(path.to_str().unwrap(), None, None).await.unwrap_err();
        assert!(err.to_string().contains("File not found"));
    }

    #[tokio::test]
    async fn read_directory() {
        let dir = test_dir();
        std::fs::write(dir.path().join("a.txt"), "").unwrap();
        std::fs::write(dir.path().join("b.txt"), "").unwrap();
        std::fs::create_dir(dir.path().join("subdir")).unwrap();

        let result = execute(dir.path().to_str().unwrap(), None, None).await.unwrap();
        assert!(result.contains("a.txt"));
        assert!(result.contains("b.txt"));
        assert!(result.contains("subdir/"));
    }

    #[tokio::test]
    async fn read_binary_file() {
        let dir = test_dir();
        let path = dir.path().join("binary.bin");
        std::fs::write(&path, &[0u8, 1, 2, 0xFF, 0xFE]).unwrap();
        let result = execute(path.to_str().unwrap(), None, None).await.unwrap();
        assert!(result.contains("Binary file"));
    }

    #[tokio::test]
    async fn read_empty_file() {
        let dir = test_dir();
        let path = dir.path().join("empty.txt");
        std::fs::write(&path, "").unwrap();
        let result = execute(path.to_str().unwrap(), None, None).await.unwrap();
        assert!(result.is_empty() || result.trim().is_empty());
    }

    #[tokio::test]
    async fn read_file_default_limit() {
        let dir = test_dir();
        let path = dir.path().join("big.txt");
        let content: String = (0..2500).map(|i| format!("line {i}")).collect::<Vec<_>>().join("\n");
        std::fs::write(&path, &content).unwrap();
        let result = execute(path.to_str().unwrap(), None, None).await.unwrap();
        assert!(result.contains("1: line 0"));
        assert!(result.contains("2000: line 1999"));
        assert!(!result.contains("2001: line 2000"));
        assert!(result.contains("Use offset=2000 to continue"));
    }
}
