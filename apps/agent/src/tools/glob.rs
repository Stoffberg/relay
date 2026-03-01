use anyhow::Result;
use globset::GlobBuilder;
use std::path::Path;
use walkdir::WalkDir;

const MAX_MATCHES: usize = 1000;

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

fn is_unfiltered_pattern(pattern: &str) -> bool {
    let stripped = pattern.trim_end_matches('/');
    matches!(stripped, "*" | "**" | "**/*" | "*/*" | "**/**")
}

pub async fn execute(pattern: &str, path: Option<&str>, _max_depth: Option<usize>) -> Result<String> {
    let base = match path {
        Some(p) => super::validate_path(p)?,
        None => std::env::current_dir()
            .map_err(|e| anyhow::anyhow!("Cannot determine current directory: {e}"))?,
    };

    if is_unfiltered_pattern(pattern) {
        return Err(anyhow::anyhow!(
            "Glob pattern must include a file filter (e.g. *.rs, **/*.ts). \
             Bare wildcard patterns like '{}' match everything and produce too much output.",
            pattern
        ));
    }

    if pattern.contains("..") {
        return Err(anyhow::anyhow!("Glob pattern must not contain '..' path traversal"));
    }

    if pattern.starts_with('/') {
        let resolved = Path::new(pattern);
        let canonical_base = base.canonicalize().unwrap_or_else(|_| base.clone());
        if !resolved.starts_with(&canonical_base) {
            return Err(anyhow::anyhow!(
                "Absolute glob pattern must be within the base directory: {}",
                canonical_base.display()
            ));
        }
    }

    let glob = GlobBuilder::new(pattern)
        .literal_separator(false)
        .build()
        .map_err(|e| anyhow::anyhow!("Invalid glob pattern: {e}"))?
        .compile_matcher();

    let mut matches: Vec<String> = Vec::new();
    let mut truncated = false;

    let walker = WalkDir::new(&base)
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
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };

        let full_path = entry.path();
        let relative = full_path.strip_prefix(&base).unwrap_or(full_path);

        if let Some(rel_str) = relative.to_str() {
            if glob.is_match(rel_str) {
                if matches.len() >= MAX_MATCHES {
                    truncated = true;
                    break;
                }
                if let Some(s) = full_path.to_str() {
                    matches.push(s.to_string());
                }
            }
        }
    }

    matches.sort();
    if truncated {
        matches.push(format!("[Truncated: more than {MAX_MATCHES} matches]"));
    }
    if matches.is_empty() {
        Ok("No matches found".to_string())
    } else {
        Ok(matches.join("\n"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn test_dir() -> TempDir {
        tempfile::tempdir_in(std::env::var("HOME").or_else(|_| std::env::var("USERPROFILE")).unwrap()).unwrap()
    }

    #[tokio::test]
    async fn glob_matches_files() {
        let dir = test_dir();
        std::fs::write(dir.path().join("a.rs"), "").unwrap();
        std::fs::write(dir.path().join("b.rs"), "").unwrap();
        std::fs::write(dir.path().join("c.txt"), "").unwrap();

        let result = execute("*.rs", Some(dir.path().to_str().unwrap()), None).await.unwrap();
        assert!(result.contains("a.rs"));
        assert!(result.contains("b.rs"));
        assert!(!result.contains("c.txt"));
    }

    #[tokio::test]
    async fn glob_no_matches() {
        let dir = test_dir();
        std::fs::write(dir.path().join("a.txt"), "").unwrap();
        let result = execute("*.rs", Some(dir.path().to_str().unwrap()), None).await.unwrap();
        assert_eq!(result, "No matches found");
    }

    #[tokio::test]
    async fn glob_nested_pattern() {
        let dir = test_dir();
        let sub = dir.path().join("src");
        std::fs::create_dir(&sub).unwrap();
        std::fs::write(sub.join("main.rs"), "").unwrap();
        let result = execute("**/*.rs", Some(dir.path().to_str().unwrap()), None).await.unwrap();
        assert!(result.contains("main.rs"));
    }

    #[tokio::test]
    async fn glob_rejects_bare_wildcard() {
        let dir = test_dir();
        std::fs::write(dir.path().join("a.rs"), "").unwrap();
        for pat in &["*", "**", "**/*", "*/*", "**/**", "*/"] {
            let err = execute(pat, Some(dir.path().to_str().unwrap()), None).await.unwrap_err();
            assert!(err.to_string().contains("file filter"), "Expected rejection for pattern: {pat}");
        }
    }

    #[tokio::test]
    async fn glob_allows_filtered_wildcard() {
        let dir = test_dir();
        std::fs::write(dir.path().join("a.rs"), "").unwrap();
        let result = execute("*.rs", Some(dir.path().to_str().unwrap()), None).await.unwrap();
        assert!(result.contains("a.rs"));
    }

    #[tokio::test]
    async fn glob_rejects_traversal() {
        let dir = test_dir();
        let err = execute("../*.rs", Some(dir.path().to_str().unwrap()), None).await.unwrap_err();
        assert!(err.to_string().contains("path traversal"));
    }

    #[tokio::test]
    async fn glob_results_sorted() {
        let dir = test_dir();
        std::fs::write(dir.path().join("c.txt"), "").unwrap();
        std::fs::write(dir.path().join("a.txt"), "").unwrap();
        std::fs::write(dir.path().join("b.txt"), "").unwrap();
        let result = execute("*.txt", Some(dir.path().to_str().unwrap()), None).await.unwrap();
        let lines: Vec<&str> = result.lines().collect();
        assert!(lines[0].ends_with("a.txt"));
        assert!(lines[1].ends_with("b.txt"));
        assert!(lines[2].ends_with("c.txt"));
    }

    #[tokio::test]
    async fn glob_skips_node_modules() {
        let dir = test_dir();
        let nm = dir.path().join("node_modules").join("pkg");
        std::fs::create_dir_all(&nm).unwrap();
        std::fs::write(nm.join("index.js"), "").unwrap();
        std::fs::write(dir.path().join("app.js"), "").unwrap();
        let result = execute("**/*.js", Some(dir.path().to_str().unwrap()), None).await.unwrap();
        assert!(result.contains("app.js"));
        assert!(!result.contains("node_modules"));
    }

    #[tokio::test]
    async fn glob_skips_dot_dirs() {
        let dir = test_dir();
        let git = dir.path().join(".git").join("objects");
        std::fs::create_dir_all(&git).unwrap();
        std::fs::write(git.join("abc123.rs"), "").unwrap();
        std::fs::write(dir.path().join("src.rs"), "").unwrap();
        let result = execute("**/*.rs", Some(dir.path().to_str().unwrap()), None).await.unwrap();
        assert!(result.contains("src.rs"));
        assert!(!result.contains(".git"));
    }
}
