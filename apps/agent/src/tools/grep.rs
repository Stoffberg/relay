use anyhow::Result;
use globset::GlobBuilder;
use std::io::{BufRead, BufReader};
use std::path::Path;
use walkdir::WalkDir;

const MAX_MATCHES: usize = 500;

const SKIP_DIRS: &[&str] = &[
    "node_modules", "target", ".git", ".venv", "venv", "__pycache__",
    ".egg-info", "dist", "build", ".next", "out", ".svelte-kit",
    ".nuxt", ".pytest_cache", ".tox", ".vscode", ".idea", "vendor",
    ".cache", ".turbo", ".nx",
];

fn should_skip_dir(name: &str) -> bool {
    if name.starts_with('.') {
        return true;
    }
    SKIP_DIRS.contains(&name)
}

pub async fn execute(pattern: &str, path: &str, include: Option<&str>) -> Result<String> {
    super::validate_path(path)?;
    if pattern.len() > 500 {
        return Err(anyhow::anyhow!("Regex pattern too long ({} chars, max 500)", pattern.len()));
    }
    let regex = regex::RegexBuilder::new(pattern)
        .size_limit(1_000_000)
        .build()?;
    let target = Path::new(path);
    let mut results = Vec::new();
    let mut skipped: usize = 0;

    if target.is_file() {
        grep_file(&regex, target, &mut results, &mut skipped);
        return finish(results, skipped);
    }

    if !target.is_dir() {
        return Err(anyhow::anyhow!("Path not found: {path}"));
    }

    let include_glob = include
        .map(|p| {
            GlobBuilder::new(p)
                .literal_separator(false)
                .build()
                .map(|g| g.compile_matcher())
        })
        .transpose()
        .map_err(|e| anyhow::anyhow!("Invalid include pattern: {e}"))?;

    let walker = WalkDir::new(target)
        .follow_links(false)
        .into_iter()
        .filter_entry(|entry| {
            if entry.file_type().is_dir() {
                if let Some(name) = entry.file_name().to_str() {
                    if entry.depth() > 0 && should_skip_dir(name) {
                        return false;
                    }
                }
            }
            true
        });

    for entry in walker {
        if results.len() >= MAX_MATCHES {
            results.push(format!("... (truncated at {MAX_MATCHES} matches)"));
            break;
        }

        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };

        if !entry.file_type().is_file() {
            continue;
        }

        if let Some(ref glob) = include_glob {
            if let Some(name) = entry.file_name().to_str() {
                if !glob.is_match(name) {
                    continue;
                }
            }
        }

        grep_file(&regex, entry.path(), &mut results, &mut skipped);
    }

    finish(results, skipped)
}

fn grep_file(regex: &regex::Regex, path: &Path, results: &mut Vec<String>, skipped: &mut usize) {
    let file = match std::fs::File::open(path) {
        Ok(f) => f,
        Err(_) => {
            *skipped += 1;
            return;
        }
    };

    let reader = BufReader::new(file);
    for (i, line) in reader.lines().enumerate() {
        if results.len() >= MAX_MATCHES {
            break;
        }
        let line = match line {
            Ok(l) => l,
            Err(_) => return,
        };
        if regex.is_match(&line) {
            let display_line = if line.len() > 500 {
                format!("{}... (line truncated)", &line[..500])
            } else {
                line
            };
            results.push(format!("{}:{}:{}", path.display(), i + 1, display_line));
        }
    }
}

fn finish(results: Vec<String>, skipped: usize) -> Result<String> {
    let mut output = results;
    if skipped > 0 {
        output.push(format!("[Skipped {skipped} unreadable file(s)]"));
    }
    if output.is_empty() {
        Ok("No matches found".to_string())
    } else {
        Ok(output.join("\n"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn test_dir() -> TempDir {
        tempfile::tempdir_in(std::env::var("HOME").unwrap()).unwrap()
    }

    #[tokio::test]
    async fn grep_single_file_match() {
        let dir = test_dir();
        let path = dir.path().join("test.txt");
        std::fs::write(&path, "hello world\nfoo bar\nhello again").unwrap();
        let result = execute("hello", path.to_str().unwrap(), None).await.unwrap();
        assert!(result.contains(":1:hello world"));
        assert!(result.contains(":3:hello again"));
        assert!(!result.contains("foo bar"));
    }

    #[tokio::test]
    async fn grep_no_matches() {
        let dir = test_dir();
        let path = dir.path().join("test.txt");
        std::fs::write(&path, "hello world").unwrap();
        let result = execute("missing", path.to_str().unwrap(), None).await.unwrap();
        assert_eq!(result, "No matches found");
    }

    #[tokio::test]
    async fn grep_regex_pattern() {
        let dir = test_dir();
        let path = dir.path().join("test.txt");
        std::fs::write(&path, "foo123\nbar456\nfoo789").unwrap();
        let result = execute("foo\\d+", path.to_str().unwrap(), None).await.unwrap();
        assert!(result.contains("foo123"));
        assert!(result.contains("foo789"));
        assert!(!result.contains("bar456"));
    }

    #[tokio::test]
    async fn grep_directory_recursive() {
        let dir = test_dir();
        std::fs::write(dir.path().join("a.txt"), "needle here").unwrap();
        let sub = dir.path().join("sub");
        std::fs::create_dir(&sub).unwrap();
        std::fs::write(sub.join("b.txt"), "another needle").unwrap();
        let result = execute("needle", dir.path().to_str().unwrap(), None).await.unwrap();
        assert!(result.contains("a.txt"));
        assert!(result.contains("b.txt"));
    }

    #[tokio::test]
    async fn grep_with_include_filter() {
        let dir = test_dir();
        std::fs::write(dir.path().join("a.rs"), "fn main").unwrap();
        std::fs::write(dir.path().join("b.txt"), "fn other").unwrap();
        let result = execute("fn", dir.path().to_str().unwrap(), Some("*.rs")).await.unwrap();
        assert!(result.contains("a.rs"));
        assert!(!result.contains("b.txt"));
    }

    #[tokio::test]
    async fn grep_skips_hidden_dirs() {
        let dir = test_dir();
        let hidden = dir.path().join(".hidden");
        std::fs::create_dir(&hidden).unwrap();
        std::fs::write(hidden.join("secret.txt"), "needle").unwrap();
        std::fs::write(dir.path().join("visible.txt"), "needle").unwrap();
        let result = execute("needle", dir.path().to_str().unwrap(), None).await.unwrap();
        assert!(result.contains("visible.txt"));
        assert!(!result.contains("secret.txt"));
    }

    #[tokio::test]
    async fn grep_skips_node_modules() {
        let dir = test_dir();
        let nm = dir.path().join("node_modules").join("pkg");
        std::fs::create_dir_all(&nm).unwrap();
        std::fs::write(nm.join("index.js"), "needle").unwrap();
        std::fs::write(dir.path().join("app.js"), "needle").unwrap();
        let result = execute("needle", dir.path().to_str().unwrap(), None).await.unwrap();
        assert!(result.contains("app.js"));
        assert!(!result.contains("node_modules"));
    }

    #[tokio::test]
    async fn grep_rejects_long_pattern() {
        let dir = test_dir();
        let path = dir.path().join("test.txt");
        std::fs::write(&path, "hello").unwrap();
        let pattern = "a".repeat(501);
        let err = execute(&pattern, path.to_str().unwrap(), None).await.unwrap_err();
        assert!(err.to_string().contains("too long"));
    }

    #[tokio::test]
    async fn grep_nonexistent_path() {
        let dir = test_dir();
        let path = dir.path().join("nope");
        let err = execute("pattern", path.to_str().unwrap(), None).await.unwrap_err();
        assert!(err.to_string().contains("not found") || err.to_string().contains("Path not found"));
    }
}
