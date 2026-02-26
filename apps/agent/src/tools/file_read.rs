use anyhow::Result;
use std::fs;
use std::path::Path;

pub async fn execute(path: &str, offset: Option<usize>, limit: Option<usize>) -> Result<String> {
    let target = Path::new(path);
    if !target.exists() {
        return Err(anyhow::anyhow!("File not found: {path}"));
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

    let content = fs::read_to_string(path)?;
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
