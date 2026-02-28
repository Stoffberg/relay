use anyhow::Result;
use std::fs;

pub async fn execute(path: &str, old: String, new: String, replace_all: bool) -> Result<String> {
    super::validate_path(path)?;
    let metadata = fs::metadata(path)?;
    if metadata.len() > 10_000_000 {
        return Err(anyhow::anyhow!(
            "File too large ({} bytes). Maximum supported size is 10MB.",
            metadata.len()
        ));
    }
    let content = fs::read_to_string(path)?;
    let count = content.matches(&old).count();
    if count == 0 {
        return Err(anyhow::anyhow!("String not found in {path}"));
    }
    if count > 1 && !replace_all {
        return Err(anyhow::anyhow!(
            "Found {count} matches for the old string in {path}. Provide more surrounding context to uniquely identify the target, or set replace_all to true."
        ));
    }
    let updated = if replace_all {
        content.replace(&old, &new)
    } else {
        content.replacen(&old, &new, 1)
    };
    let tmp_path = format!("{}.tmp", path);
    fs::write(&tmp_path, &updated)?;
    fs::rename(&tmp_path, path)?;
    let replaced = if replace_all { count } else { 1 };
    Ok(format!("Replaced {replaced} occurrence(s) in {path}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn test_dir() -> TempDir {
        tempfile::tempdir_in(std::env::var("HOME").unwrap()).unwrap()
    }

    fn write_test_file(dir: &TempDir, name: &str, content: &str) -> String {
        let path = dir.path().join(name);
        std::fs::write(&path, content).unwrap();
        path.to_str().unwrap().to_string()
    }

    #[tokio::test]
    async fn edit_single_match() {
        let dir = test_dir();
        let path = write_test_file(&dir, "test.txt", "hello world");
        let result = execute(&path, "hello".into(), "goodbye".into(), false).await.unwrap();
        assert!(result.contains("1 occurrence"));
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "goodbye world");
    }

    #[tokio::test]
    async fn edit_no_match_errors() {
        let dir = test_dir();
        let path = write_test_file(&dir, "test.txt", "hello world");
        let err = execute(&path, "missing".into(), "replaced".into(), false).await.unwrap_err();
        assert!(err.to_string().contains("String not found"));
    }

    #[tokio::test]
    async fn edit_multiple_matches_without_flag_errors() {
        let dir = test_dir();
        let path = write_test_file(&dir, "test.txt", "aaa bbb aaa");
        let err = execute(&path, "aaa".into(), "ccc".into(), false).await.unwrap_err();
        assert!(err.to_string().contains("2 matches"));
    }

    #[tokio::test]
    async fn edit_replace_all() {
        let dir = test_dir();
        let path = write_test_file(&dir, "test.txt", "aaa bbb aaa");
        let result = execute(&path, "aaa".into(), "ccc".into(), true).await.unwrap();
        assert!(result.contains("2 occurrence"));
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "ccc bbb ccc");
    }

    #[tokio::test]
    async fn edit_multiline_content() {
        let dir = test_dir();
        let path = write_test_file(&dir, "test.txt", "line1\nline2\nline3");
        execute(&path, "line2".into(), "REPLACED".into(), false).await.unwrap();
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "line1\nREPLACED\nline3");
    }

    #[tokio::test]
    async fn edit_nonexistent_file_errors() {
        let dir = test_dir();
        let path = dir.path().join("nope.txt");
        let err = execute(path.to_str().unwrap(), "a".into(), "b".into(), false).await.unwrap_err();
        assert!(!err.to_string().is_empty());
    }
}
