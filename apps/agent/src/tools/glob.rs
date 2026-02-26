use anyhow::Result;
use std::path::PathBuf;

pub async fn execute(pattern: &str, path: Option<&str>) -> Result<String> {
    let base = path
        .map(PathBuf::from)
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| PathBuf::from("/")));

    let full_pattern = if pattern.starts_with('/') {
        pattern.to_string()
    } else {
        format!("{}/{}", base.display(), pattern)
    };

    let mut matches: Vec<String> = Vec::new();
    for entry in glob::glob(&full_pattern)? {
        match entry {
            Ok(path) => {
                if let Some(s) = path.to_str() {
                    matches.push(s.to_string());
                }
            }
            Err(e) => {
                matches.push(format!("error: {e}"));
            }
        }
    }

    matches.sort();
    if matches.is_empty() {
        Ok("No matches found".to_string())
    } else {
        Ok(matches.join("\n"))
    }
}
