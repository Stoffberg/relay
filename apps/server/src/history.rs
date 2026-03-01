use spacetimedb_sdk::Table;

use crate::module_bindings::message_part_table::MessagePartTableAccess;
use crate::module_bindings::message_table::MessageTableAccess;
use crate::module_bindings::tool_command_table::ToolCommandTableAccess;
use crate::module_bindings::tool_result_table::ToolResultTableAccess;
use crate::module_bindings::DbConnection;
use crate::state::{LLMMessage, ToolCall, ToolCallFunction};

pub fn fetch_history(conn: &DbConnection, session_id: &str) -> Vec<LLMMessage> {
    let mut messages: Vec<_> = conn
        .db
        .message()
        .iter()
        .filter(|m| m.session_id == session_id && m.status == "complete")
        .collect();

    messages.sort_by_key(|m| m.created_at);

    let message_ids: std::collections::HashSet<&str> =
        messages.iter().map(|m| m.id.as_str()).collect();

    let parts: Vec<_> = conn
        .db
        .message_part()
        .iter()
        .filter(|p| message_ids.contains(p.message_id.as_str()))
        .collect();

    let mut content_by_msg: std::collections::HashMap<&str, Vec<_>> =
        std::collections::HashMap::new();
    for part in &parts {
        content_by_msg
            .entry(part.message_id.as_str())
            .or_default()
            .push(part);
    }

    for parts_vec in content_by_msg.values_mut() {
        parts_vec.sort_by_key(|p| p.part_index);
    }

    let tool_commands: Vec<_> = conn
        .db
        .tool_command()
        .iter()
        .filter(|c| c.session_id == session_id)
        .collect();

    let tool_cmd_ids: std::collections::HashSet<u64> = tool_commands.iter().map(|c| c.id).collect();
    let tool_results: Vec<_> = conn
        .db
        .tool_result()
        .iter()
        .filter(|r| tool_cmd_ids.contains(&r.tool_command_id))
        .collect();

    let mut result = Vec::new();

    for m in &messages {
        if m.role == "explore" {
            continue;
        }

        let mut text = content_by_msg
            .get(m.id.as_str())
            .map(|parts| parts.iter().map(|p| p.content.as_str()).collect::<String>())
            .unwrap_or_default();
        if let Some(ref err) = m.error {
            if !text.is_empty() {
                text.push_str("\n\n");
            }
            text.push_str(&format!("[Error: {}]", err));
        }

        if m.role == "assistant" {
            let msg_tool_calls: Vec<_> = tool_commands
                .iter()
                .filter(|c| c.message_id == m.id)
                .collect();

            if msg_tool_calls.is_empty() {
                if !text.is_empty() {
                    result.push(LLMMessage {
                        role: "assistant".to_string(),
                        content: Some(text),
                        tool_calls: None,
                        tool_call_id: None,
                    });
                }
            } else {
                let tc: Vec<ToolCall> = msg_tool_calls
                    .iter()
                    .map(|c| {
                        let id = if c.tool_call_id.is_empty() {
                            format!("call_{}", c.id)
                        } else {
                            c.tool_call_id.clone()
                        };
                        ToolCall {
                            id,
                            call_type: "function".to_string(),
                            function: ToolCallFunction {
                                name: c.tool_name.clone(),
                                arguments: c.tool_args.clone(),
                            },
                        }
                    })
                    .collect();

                result.push(LLMMessage {
                    role: "assistant".to_string(),
                    content: if text.is_empty() { None } else { Some(text) },
                    tool_calls: Some(tc.clone()),
                    tool_call_id: None,
                });

                for (i, cmd) in msg_tool_calls.iter().enumerate() {
                    let tool_output = tool_results
                        .iter()
                        .find(|r| r.tool_command_id == cmd.id)
                        .map(|r| {
                            if r.success {
                                if r.output.len() > 30000 {
                                    let boundary = r
                                        .output
                                        .char_indices()
                                        .take_while(|(i, _)| *i <= 30000)
                                        .last()
                                        .map(|(i, c)| i + c.len_utf8())
                                        .unwrap_or(0);
                                    format!("{}... (truncated)", &r.output[..boundary])
                                } else {
                                    r.output.clone()
                                }
                            } else {
                                format!(
                                    "Error: {}",
                                    r.error.clone().unwrap_or_else(|| r.output.clone())
                                )
                            }
                        })
                        .unwrap_or_else(|| "Tool did not return a result".to_string());

                    result.push(LLMMessage {
                        role: "tool".to_string(),
                        content: Some(tool_output),
                        tool_calls: None,
                        tool_call_id: Some(tc[i].id.clone()),
                    });
                }
            }
        } else if !text.is_empty() {
            result.push(LLMMessage {
                role: m.role.clone(),
                content: Some(text),
                tool_calls: None,
                tool_call_id: None,
            });
        }
    }

    result
}
