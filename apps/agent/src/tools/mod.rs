pub mod file_edit;
pub mod file_read;
pub mod file_write;
pub mod glob;
pub mod grep;
pub mod shell_exec;
pub mod web_fetch;

use std::path::{Path, PathBuf};

pub fn validate_path(path: &str) -> anyhow::Result<PathBuf> {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_else(|_| "/".to_string());
    let home_path = Path::new(&home).canonicalize().unwrap_or_else(|_| PathBuf::from(&home));

    let target = Path::new(path);

    if target.components().any(|c| c == std::path::Component::ParentDir) {
        return Err(anyhow::anyhow!("Path traversal (..) is not allowed"));
    }

    let resolved = if target.exists() {
        target.canonicalize()?
    } else if let Some(parent) = target.parent() {
        if parent.exists() {
            let canonical_parent = parent.canonicalize()?;
            canonical_parent.join(target.file_name().unwrap_or_default())
        } else {
            target.to_path_buf()
        }
    } else {
        target.to_path_buf()
    };

    if !resolved.starts_with(&home_path) {
        return Err(anyhow::anyhow!(
            "Path {} is outside the home directory ({}). Access denied.",
            path,
            home_path.display()
        ));
    }

    Ok(resolved)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_path_rejects_traversal() {
        let result = validate_path("/tmp/../etc/passwd");
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("Path traversal"));
    }

    #[test]
    fn validate_path_rejects_outside_home() {
        let result = validate_path("/etc/passwd");
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("outside the home directory"));
    }

    fn home_dir() -> String {
        std::env::var("HOME")
            .or_else(|_| std::env::var("USERPROFILE"))
            .unwrap()
    }

    #[test]
    fn validate_path_accepts_home_subpath() {
        let home = home_dir();
        let result = validate_path(&home);
        assert!(result.is_ok());
    }

    #[test]
    fn validate_path_accepts_nonexistent_under_home() {
        let home = home_dir();
        let path = format!("{}/nonexistent_test_file_abc123.txt", home);
        let result = validate_path(&path);
        assert!(result.is_ok());
    }
}
