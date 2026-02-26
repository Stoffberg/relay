use anyhow::Result;
use std::process::Command;

pub async fn execute(command: &str, workdir: Option<&str>) -> Result<String> {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/Users/dirk.beukes".to_string());
    let path = format!(
        "{}/.bun/bin:{}/.cargo/bin:{}/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin",
        home, home, home
    );

    let mut cmd = Command::new("sh");
    cmd.arg("-c").arg(command);
    cmd.env("HOME", &home);
    cmd.env("PATH", &path);
    cmd.env("LANG", "en_US.UTF-8");

    if let Some(dir) = workdir {
        cmd.current_dir(dir);
    }

    let output = cmd.output()?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    if output.status.success() {
        let mut result = stdout.to_string();
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
        result.push_str(&format!("Exit code: {}\n", output.status.code().unwrap_or(-1)));
        if !stderr.is_empty() {
            result.push_str(&stderr);
        }
        Err(anyhow::anyhow!("{}", result))
    }
}
