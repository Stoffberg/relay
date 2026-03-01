use anyhow::Result;

const MAX_OUTPUT_BYTES: usize = 1_048_576;
const TIMEOUT_SECS: u64 = 120;

pub async fn execute(command: &str, workdir: Option<&str>) -> Result<String> {
    let existing_path = std::env::var("PATH").unwrap_or_default();
    let path = if let Ok(home) = std::env::var("HOME").or_else(|_| std::env::var("USERPROFILE")) {
        let extra_dirs = format!(
            "{}/.bun/bin:{}/.cargo/bin:{}/.local/bin:/opt/homebrew/bin",
            home, home, home
        );
        format!("{extra_dirs}:{existing_path}")
    } else {
        format!("/opt/homebrew/bin:{existing_path}")
    };

    let mut cmd = tokio::process::Command::new("sh");
    cmd.arg("-c").arg(command);
    cmd.env("PATH", &path);
    cmd.env("LANG", "en_US.UTF-8");

    if let Some(dir) = workdir {
        cmd.current_dir(dir);
    }

    #[cfg(unix)]
    unsafe { cmd.pre_exec(|| { libc::setpgid(0, 0); Ok(()) }); }

    cmd.kill_on_drop(true);
    let output = match tokio::time::timeout(
        std::time::Duration::from_secs(TIMEOUT_SECS),
        cmd.output(),
    )
    .await
    {
        Ok(result) => result?,
        Err(_) => {
            return Err(anyhow::anyhow!(
                "Command timed out after {TIMEOUT_SECS} seconds"
            ));
        }
    };

    let stdout = truncate_output(&output.stdout);
    let stderr = truncate_output(&output.stderr);

    if output.status.success() {
        let mut result = stdout;
        if !stderr.is_empty() {
            if !result.is_empty() && !result.ends_with('\n') {
                result.push('\n');
            }
            result.push_str(&stderr);
        }
        if result.trim().is_empty() {
            result = "(command succeeded with no output)".to_string();
        }
        Ok(result)
    } else {
        let mut result = String::new();
        if !stdout.is_empty() {
            result.push_str(&stdout);
            if !result.ends_with('\n') {
                result.push('\n');
            }
        }
        result.push_str(&format!(
            "Exit code: {}\n",
            output.status.code().unwrap_or(-1)
        ));
        if !stderr.is_empty() {
            result.push_str(&stderr);
        }
        Err(anyhow::anyhow!("{}", result))
    }
}

fn truncate_output(bytes: &[u8]) -> String {
    if bytes.len() > MAX_OUTPUT_BYTES {
        let safe = match std::str::from_utf8(&bytes[..MAX_OUTPUT_BYTES]) {
            Ok(s) => s.to_string(),
            Err(e) => String::from_utf8_lossy(&bytes[..e.valid_up_to()]).to_string(),
        };
        format!("{safe}\n[output truncated at 1MB]")
    } else {
        String::from_utf8_lossy(bytes).to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn exec_simple_command() {
        let result = execute("echo hello", None).await.unwrap();
        assert_eq!(result.trim(), "hello");
    }

    #[tokio::test]
    async fn exec_command_with_exit_code() {
        let err = execute("exit 42", None).await.unwrap_err();
        assert!(err.to_string().contains("Exit code: 42"));
    }

    #[tokio::test]
    async fn exec_command_with_stderr() {
        let result = execute("echo out && echo err >&2", None).await.unwrap();
        assert!(result.contains("out"));
        assert!(result.contains("err"));
    }

    #[tokio::test]
    async fn exec_no_output() {
        let result = execute("true", None).await.unwrap();
        assert!(result.contains("command succeeded with no output"));
    }

    #[tokio::test]
    async fn exec_with_workdir() {
        let dir = tempfile::tempdir_in(std::env::var("HOME").unwrap()).unwrap();
        let result = execute("pwd", Some(dir.path().to_str().unwrap())).await.unwrap();
        let canonical = dir.path().canonicalize().unwrap();
        assert!(result.trim().ends_with(canonical.file_name().unwrap().to_str().unwrap()));
    }

    #[tokio::test]
    async fn exec_multiline_output() {
        let result = execute("printf 'a\\nb\\nc'", None).await.unwrap();
        assert_eq!(result.trim(), "a\nb\nc");
    }

    #[test]
    fn truncate_within_limit() {
        let bytes = b"hello";
        assert_eq!(truncate_output(bytes), "hello");
    }

    #[test]
    fn truncate_over_limit() {
        let bytes = vec![b'x'; MAX_OUTPUT_BYTES + 100];
        let result = truncate_output(&bytes);
        assert!(result.contains("[output truncated at 1MB]"));
    }
}
