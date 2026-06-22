/**
 * Cleans the agent's response text by stripping:
 * 1. Raw XML function call blocks leaked by some models (e.g. <function=...>...</function>)
 * 2. Tool-result echo lines the LLM may accidentally include in its reply
 *    (e.g. "search_contacts: Found one contact...", "match_type:", "fuzzy_score:")
 */
export function cleanAgentResponse(text: string): string {
  if (!text) return '';
  return text
    // Strip raw XML function call blocks
    .replace(/<function[\s\S]*?<\/function>/gi, '')
    // Strip lines that look like tool result echo (e.g. "search_contacts: ...")
    .replace(/^(search_contacts|search_meetings|get_today_meetings|create_meeting|cancel_meeting|update_meeting|check_conflicts|list_notifications|get_briefing|create_contact|send_email)\s*:.*$/gim, '')
    // Strip lines containing internal field names
    .replace(/^\s*(match_type|fuzzy_score)\s*[=:].*/gim, '')
    // Collapse multiple blank lines left behind
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
