use anyhow::Result;
use std::fs;

pub async fn execute(path: &str, old: String, new: String) -> Result<String> {
    let content = fs::read_to_string(path)?;
    let count = content.matches(&old).count();
    if count == 0 {
        return Err(anyhow::anyhow!("String not found in {path}"));
    }
    let updated = content.replacen(&old, &new, 1);
    fs::write(path, &updated)?;
    Ok(format!("Replaced 1 occurrence in {} ({} total found)", path, count))
}
