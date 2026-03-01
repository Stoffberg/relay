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
        if let Some((matched, updated)) = try_whitespace_normalized_match(&content, &old, &new) {
            let tmp_path = format!("{}.tmp", path);
            fs::write(&tmp_path, &updated)?;
            fs::rename(&tmp_path, path)?;
            let chars = updated.chars().count();
            return Ok(format!(
                "Whitespace-normalized match: replaced 1 occurrence in {path} ({chars} chars). Matched against: {:?}",
                &matched[..matched.len().min(80)]
            ));
        }

        let threshold = fuzzy_threshold(old.len());
        if let Some((matched, dist)) = find_fuzzy_match(&content, &old, threshold) {
            let updated = content.replacen(&matched, &new, 1);
            let tmp_path = format!("{}.tmp", path);
            fs::write(&tmp_path, &updated)?;
            fs::rename(&tmp_path, path)?;
            let chars = updated.chars().count();
            return Ok(format!(
                "Fuzzy matched and replaced 1 occurrence in {path} (edit distance {dist}, {chars} chars)"
            ));
        }
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
    let chars = updated.chars().count();
    Ok(format!("Replaced {replaced} occurrence(s) in {path} ({chars} chars)"))
}

fn normalize_line_whitespace(s: &str) -> String {
    s.lines()
        .map(|line| line.trim_start())
        .collect::<Vec<_>>()
        .join("\n")
}

fn try_whitespace_normalized_match(content: &str, old: &str, new: &str) -> Option<(String, String)> {
    if !old.contains('\n') {
        return None;
    }

    let norm_old = normalize_line_whitespace(old);
    let content_lines: Vec<&str> = content.lines().collect();
    let old_lines: Vec<&str> = norm_old.lines().collect();
    let old_line_count = old_lines.len();

    if old_line_count == 0 || old_line_count > content_lines.len() {
        return None;
    }

    for start in 0..=content_lines.len() - old_line_count {
        let window = &content_lines[start..start + old_line_count];
        let norm_window: Vec<&str> = window.iter().map(|l| l.trim_start()).collect();
        if norm_window == old_lines {
            let matched = window.join("\n");
            let indent = window[0].len() - window[0].trim_start().len();
            let indent_str = &window[0][..indent];
            let new_indented = new.lines().enumerate().map(|(i, line)| {
                if i == 0 || line.trim_start().is_empty() {
                    line.to_string()
                } else {
                    let trimmed = line.trim_start();
                    format!("{indent_str}{trimmed}")
                }
            }).collect::<Vec<_>>().join("\n");

            let updated = content.replacen(&matched, &new_indented, 1);
            return Some((matched, updated));
        }
    }

    None
}

fn fuzzy_threshold(needle_len: usize) -> usize {
    match needle_len {
        0..=10 => 1,
        11..=50 => 2,
        51..=150 => 3,
        151..=400 => 5,
        _ => 8,
    }
}

fn levenshtein(a: &str, b: &str) -> usize {
    let a_chars: Vec<char> = a.chars().collect();
    let b_chars: Vec<char> = b.chars().collect();
    let m = a_chars.len();
    let n = b_chars.len();
    let mut prev = (0..=n).collect::<Vec<_>>();
    let mut curr = vec![0; n + 1];
    for i in 1..=m {
        curr[0] = i;
        for j in 1..=n {
            let cost = if a_chars[i - 1] == b_chars[j - 1] { 0 } else { 1 };
            curr[j] = (prev[j] + 1).min(curr[j - 1] + 1).min(prev[j - 1] + cost);
        }
        std::mem::swap(&mut prev, &mut curr);
    }
    prev[n]
}

fn find_fuzzy_match(content: &str, needle: &str, threshold: usize) -> Option<(String, usize)> {
    let needle_chars: Vec<char> = needle.chars().collect();
    let content_chars: Vec<char> = content.chars().collect();
    let nlen = needle_chars.len();
    if nlen == 0 || content_chars.is_empty() {
        return None;
    }

    let min_window = nlen.saturating_sub(threshold).max(1);
    let max_window = (nlen + threshold).min(content_chars.len());

    let mut best: Option<(usize, usize, usize)> = None;

    for window_len in min_window..=max_window {
        for start in 0..=content_chars.len() - window_len {
            let candidate: String = content_chars[start..start + window_len].iter().collect();
            let dist = levenshtein(&candidate, needle);
            if dist <= threshold {
                let dominated = match &best {
                    None => true,
                    Some((_, _, best_dist)) if dist < *best_dist => true,
                    Some((_, best_len, best_dist))
                        if dist == *best_dist
                            && (window_len as isize - nlen as isize).unsigned_abs()
                                < (*best_len as isize - nlen as isize).unsigned_abs() =>
                    {
                        true
                    }
                    _ => false,
                };
                if dominated {
                    best = Some((start, window_len, dist));
                }
            }
        }
    }

    best.map(|(start, len, dist)| {
        let matched: String = content_chars[start..start + len].iter().collect();
        (matched, dist)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn test_dir() -> TempDir {
        tempfile::tempdir_in(std::env::var("HOME").or_else(|_| std::env::var("USERPROFILE")).unwrap()).unwrap()
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

    #[tokio::test]
    async fn edit_fuzzy_one_char_off() {
        let dir = test_dir();
        let path = write_test_file(&dir, "test.rs", "fn main() {\n    println!(\"hello\");\n}");
        let result = execute(&path, "fn main() {\n    println!(\"hello\")\n}".into(), "fn main() {\n    println!(\"goodbye\");\n}".into(), false).await.unwrap();
        assert!(result.contains("Fuzzy matched"));
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "fn main() {\n    println!(\"goodbye\");\n}");
    }

    #[tokio::test]
    async fn edit_fuzzy_wrong_bracket() {
        let dir = test_dir();
        let path = write_test_file(&dir, "test.rs", "if (x > 0) { return true; }");
        let result = execute(&path, "if (x > 0) { return true; )".into(), "if (x > 0) { return false; }".into(), false).await.unwrap();
        assert!(result.contains("Fuzzy matched"));
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "if (x > 0) { return false; }");
    }

    #[tokio::test]
    async fn edit_fuzzy_too_far_off_fails() {
        let dir = test_dir();
        let path = write_test_file(&dir, "test.txt", "hello world");
        let err = execute(&path, "completely different text".into(), "replaced".into(), false).await.unwrap_err();
        assert!(err.to_string().contains("String not found"));
    }

    #[test]
    fn levenshtein_basic() {
        assert_eq!(levenshtein("kitten", "sitting"), 3);
        assert_eq!(levenshtein("hello", "hello"), 0);
        assert_eq!(levenshtein("hello", "helo"), 1);
        assert_eq!(levenshtein("", "abc"), 3);
    }

    #[test]
    fn fuzzy_threshold_values() {
        assert_eq!(fuzzy_threshold(5), 1);
        assert_eq!(fuzzy_threshold(50), 2);
        assert_eq!(fuzzy_threshold(200), 5);
        assert_eq!(fuzzy_threshold(500), 8);
    }

    #[tokio::test]
    async fn edit_whitespace_normalized_match() {
        let dir = test_dir();
        let content = "function foo() {\n    if (true) {\n        return 1;\n    }\n}";
        let path = write_test_file(&dir, "test.js", content);
        let result = execute(
            &path,
            "if (true) {\n    return 1;\n}".into(),
            "if (false) {\n    return 0;\n}".into(),
            false,
        ).await.unwrap();
        assert!(result.contains("Whitespace-normalized"));
        let updated = std::fs::read_to_string(&path).unwrap();
        assert!(updated.contains("if (false)"));
        assert!(updated.contains("return 0"));
    }
}
