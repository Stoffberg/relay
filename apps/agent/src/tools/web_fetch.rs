use anyhow::Result;

const MAX_OUTPUT_CHARS: usize = 30_000;

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
        Ok(format!("{}... (truncated at {} chars)", &text[..MAX_OUTPUT_CHARS], MAX_OUTPUT_CHARS))
    } else {
        Ok(text)
    }
}

fn strip_html(html: &str) -> String {
    let script_re = regex::Regex::new(r"(?is)<script[^>]*>.*?</script>").unwrap();
    let style_re = regex::Regex::new(r"(?is)<style[^>]*>.*?</style>").unwrap();
    let tag_re = regex::Regex::new(r"<[^>]+>").unwrap();

    let no_scripts = script_re.replace_all(html, "");
    let no_styles = style_re.replace_all(&no_scripts, "");
    let no_tags = tag_re.replace_all(&no_styles, "");

    let lines: Vec<&str> = no_tags
        .lines()
        .map(|l| l.trim())
        .filter(|l| !l.is_empty())
        .collect();

    lines.join("\n")
}
