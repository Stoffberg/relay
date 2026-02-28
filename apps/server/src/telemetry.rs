use serde_json::Value;
use tokio::sync::mpsc;
use tracing::field::{Field, Visit};
use tracing_subscriber::layer::Context;
use tracing_subscriber::Layer;

struct FieldVisitor {
    fields: serde_json::Map<String, Value>,
}

impl Visit for FieldVisitor {
    fn record_f64(&mut self, field: &Field, value: f64) {
        self.fields
            .insert(field.name().to_string(), Value::from(value));
    }

    fn record_i64(&mut self, field: &Field, value: i64) {
        self.fields
            .insert(field.name().to_string(), Value::from(value));
    }

    fn record_u64(&mut self, field: &Field, value: u64) {
        self.fields
            .insert(field.name().to_string(), Value::from(value));
    }

    fn record_bool(&mut self, field: &Field, value: bool) {
        self.fields
            .insert(field.name().to_string(), Value::from(value));
    }

    fn record_str(&mut self, field: &Field, value: &str) {
        self.fields
            .insert(field.name().to_string(), Value::from(value));
    }

    fn record_debug(&mut self, field: &Field, value: &dyn std::fmt::Debug) {
        self.fields
            .insert(field.name().to_string(), Value::from(format!("{value:?}")));
    }
}

pub struct AxiomLayer {
    tx: mpsc::UnboundedSender<Value>,
}

impl<S> Layer<S> for AxiomLayer
where
    S: tracing::Subscriber,
{
    fn on_event(&self, event: &tracing::Event<'_>, _ctx: Context<'_, S>) {
        let meta = event.metadata();
        if *meta.level() > tracing::Level::INFO && !meta.target().starts_with("relay_server") {
            return;
        }

        let mut visitor = FieldVisitor {
            fields: serde_json::Map::new(),
        };
        event.record(&mut visitor);

        visitor
            .fields
            .insert("level".into(), Value::from(meta.level().as_str()));
        visitor
            .fields
            .insert("target".into(), Value::from(meta.target()));
        visitor.fields.insert(
            "_time".into(),
            Value::from(iso8601_now()),
        );

        let _ = self.tx.send(Value::Object(visitor.fields));
    }
}

fn iso8601_now() -> String {
    let now = std::time::SystemTime::now();
    let duration = now
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    let millis = duration.as_millis() as u64;
    let secs = millis / 1000;
    let ms = millis % 1000;

    let days = secs / 86400;
    let time_of_day = secs % 86400;
    let hours = time_of_day / 3600;
    let minutes = (time_of_day % 3600) / 60;
    let seconds = time_of_day % 60;

    let mut y = 1970i32;
    let mut remaining_days = days as i32;
    loop {
        let year_days = if y % 4 == 0 && (y % 100 != 0 || y % 400 == 0) { 366 } else { 365 };
        if remaining_days < year_days {
            break;
        }
        remaining_days -= year_days;
        y += 1;
    }
    let leap = y % 4 == 0 && (y % 100 != 0 || y % 400 == 0);
    let month_days = [31, if leap { 29 } else { 28 }, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let mut m = 0usize;
    while m < 12 && remaining_days >= month_days[m] {
        remaining_days -= month_days[m];
        m += 1;
    }

    format!(
        "{y:04}-{:02}-{:02}T{hours:02}:{minutes:02}:{seconds:02}.{ms:03}Z",
        m + 1,
        remaining_days + 1,
    )
}

pub fn try_init_axiom() -> Option<AxiomLayer> {
    let token = std::env::var("AXIOM_TOKEN").ok()?;
    let dataset = std::env::var("AXIOM_DATASET").ok()?;

    let (tx, rx) = mpsc::unbounded_channel::<Value>();

    let client = reqwest::Client::new();
    let url = format!("https://api.axiom.co/v1/datasets/{dataset}/ingest");

    tokio::spawn(run_batcher(client, url, token, rx));

    tracing::info!("Axiom telemetry enabled (dataset: {dataset})");
    Some(AxiomLayer { tx })
}

async fn run_batcher(
    client: reqwest::Client,
    url: String,
    token: String,
    mut rx: mpsc::UnboundedReceiver<Value>,
) {
    let mut batch: Vec<Value> = Vec::with_capacity(256);
    let flush_interval = std::time::Duration::from_secs(2);

    loop {
        let deadline = tokio::time::sleep(flush_interval);
        tokio::pin!(deadline);

        loop {
            tokio::select! {
                msg = rx.recv() => {
                    match msg {
                        Some(event) => {
                            batch.push(event);
                            if batch.len() >= 200 {
                                break;
                            }
                        }
                        None => {
                            if !batch.is_empty() {
                                flush(&client, &url, &token, &mut batch).await;
                            }
                            return;
                        }
                    }
                }
                _ = &mut deadline => {
                    break;
                }
            }
        }

        if !batch.is_empty() {
            flush(&client, &url, &token, &mut batch).await;
        }
    }
}

async fn flush(client: &reqwest::Client, url: &str, token: &str, batch: &mut Vec<Value>) {
    let events: Vec<Value> = batch.drain(..).collect();
    let count = events.len();

    match client
        .post(url)
        .header("Authorization", format!("Bearer {token}"))
        .header("Content-Type", "application/json")
        .json(&events)
        .send()
        .await
    {
        Ok(res) if res.status().is_success() => {}
        Ok(res) => {
            let status = res.status();
            let body = res.text().await.unwrap_or_default();
            eprintln!("[axiom] flush failed ({status}): {body} ({count} events lost)");
        }
        Err(e) => {
            eprintln!("[axiom] flush error: {e} ({count} events lost)");
        }
    }
}
