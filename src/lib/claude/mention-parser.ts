export interface ParsedMention {
  hasClaude: boolean;
  mentionedUserIds: string[];
}

const CLAUDE_MENTIONS = ['@claude', '@Claude', '@CLAUDE'];

export function parseMentions(
  content: string,
  userMap: Record<string, string>,
): ParsedMention {
  const hasClaude = CLAUDE_MENTIONS.some((m) => content.includes(m));
  const mentionedUserIds: string[] = [];

  // Strip markdown bold/italic wrappers around @mentions (e.g. **@Nate Tester**)
  const normalized = content.replace(/\*{1,2}(@[^*]+?)\*{1,2}/g, '$1');

  // Match @FirstName LastName or @FirstName (two-word names supported)
  const mentionRegex = /@(\w+(?:\s+\w+)?)/g;
  let match;
  while ((match = mentionRegex.exec(normalized)) !== null) {
    const raw = match[1];
    if (CLAUDE_MENTIONS.includes(`@${raw}`)) continue;
    // Collapse spaces so "Nate Tester" → "natetester" matches the userMap key
    const key = raw.toLowerCase().replace(/\s+/g, '');
    const userId = userMap[key];
    if (userId && !mentionedUserIds.includes(userId)) mentionedUserIds.push(userId);
  }

  return { hasClaude, mentionedUserIds };
}
