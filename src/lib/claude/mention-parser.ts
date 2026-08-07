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

  const mentionRegex = /@(\w+)/g;
  let match;
  while ((match = mentionRegex.exec(content)) !== null) {
    if (!CLAUDE_MENTIONS.includes(`@${match[1]}`)) {
      const userId = userMap[match[1].toLowerCase()];
      if (userId) mentionedUserIds.push(userId);
    }
  }

  return { hasClaude, mentionedUserIds };
}
