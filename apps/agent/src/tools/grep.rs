use anyhow::Result;
use std::fs;
use std::path::Path;

pub async fn execute(pattern: &str, path: &str, include: Option<&str>) -> Result<String> {
    let regex = regex::Regex::new(pattern)?;
    let target = Path::new(path);
    let mut results = Vec::new();

    if target.is_file() {
        grep_file(&regex, target, &mut results)?;
    } else if target.is_dir() {
        grep_dir(&regex, target, include, &mut results)?;
    } else {
        return Err(anyhow::anyhow!("Path not found: {path}"));
    }

    if results.is_empty() {
        Ok("No matches found".to_string())
    } else {
        Ok(results.join("\n"))
    }
}

fn grep_file(regex: &regex::Regex, path: &Path, results: &mut Vec<String>) -> Result<()> {
    let content = match fs::read_to_string(path) {
        Ok(c) => c,
        Err(_) => return Ok(()),
    };

    for (i, line) in content.lines().enumerate() {
        if regex.is_match(line) {
            results.push(format!("{}:{}:{}", path.display(), i + 1, line));
        }
    }
    Ok(())
}

fn grep_dir(
    regex: &regex::Regex,
    dir: &Path,
    include: Option<&str>,
    results: &mut Vec<String>,
) -> Result<()> {
    let include_pattern = include.and_then(|p| glob::Pattern::new(p).ok());

    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return Ok(()),
    };

    for entry in entries {
        let entry = entry?;
        let path = entry.path();
        let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");

        if name.starts_with('.') || name == "node_modules" || name == "target" || name == ".git" {
            continue;
        }

        if path.is_dir() {
            grep_dir(regex, &path, include, results)?;
        } else if path.is_file() {
            if let Some(ref pat) = include_pattern {
                if !pat.matches(name) {
                    continue;
                }
            }
            grep_file(regex, &path, results)?;
        }

        if results.len() > 500 {
            results.push("... (truncated at 500 matches)".to_string());
            break;
        }
    }
    Ok(())
}
