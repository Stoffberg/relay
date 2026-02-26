use anyhow::Result;
use std::fs;
use std::path::Path;

pub async fn execute(path: &str, content: String) -> Result<String> {
    let target = Path::new(path);
    if let Some(parent) = target.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)?;
        }
    }
    let len = content.len();
    fs::write(path, content)?;
    Ok(format!("Wrote {} bytes to {}", len, path))
}
