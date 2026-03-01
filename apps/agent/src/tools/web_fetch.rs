use anyhow::Result;
use std::sync::LazyLock;

const MAX_OUTPUT_CHARS: usize = 30_000;

static SCRIPT_RE: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new(r"(?is)<script[^>]*>.*?</script>").unwrap());
static STYLE_RE: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new(r"(?is)<style[^>]*>.*?</style>").unwrap());
static TAG_RE: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new(r"<[^>]+>").unwrap());

pub async fn execute(url: &str) -> Result<String> {
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err(anyhow::anyhow!("URL must start with http:// or https://"));
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()?;

    let response = client
        .get(url)
        .header("User-Agent", "Relay-Agent/1.0")
        .send()
        .await?;

    let status = response.status();
    if !status.is_success() {
        return Err(anyhow::anyhow!("HTTP {} for {}", status.as_u16(), url));
    }

    let body = response.text().await?;
    let text = strip_html(&body);

    if text.len() > MAX_OUTPUT_CHARS {
        let truncated: String = text.chars().take(MAX_OUTPUT_CHARS).collect();
        Ok(format!("{truncated}... (truncated at {MAX_OUTPUT_CHARS} chars)"))
    } else {
        Ok(text)
    }
}

fn strip_html(html: &str) -> String {
    let no_scripts = SCRIPT_RE.replace_all(html, "");
    let no_styles = STYLE_RE.replace_all(&no_scripts, "");
    let no_tags = TAG_RE.replace_all(&no_styles, "");

    let lines: Vec<&str> = no_tags
        .lines()
        .map(|l| l.trim())
        .filter(|l| !l.is_empty())
        .collect();

    lines.join("\n")
}
