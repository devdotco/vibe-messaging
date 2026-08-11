const URL_RE = /https?:\/\/[^\s<>"'[\]]+|www\.[^\s<>"'[\]]+|[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.(?:com|org|net|io|co|gov|edu|app|dev|ai|tech|info|me|us|uk|au|ca|de|fr|jp|cn|br|in|ru|nl)(?:\/[^\s<>"'[\]]*)?/gi;

/** Convert bare URLs in plain text to markdown link syntax before passing to micromark. */
export function linkifyMarkdown(text: string): string {
  return text.replace(new RegExp(URL_RE.source, 'gi'), (url) => {
    const clean = url.replace(/[.,;:!?)\]]+$/, '');
    const trail = url.slice(clean.length);
    const href = /^https?:\/\//i.test(clean) ? clean : `https://${clean}`;
    return `[${clean}](${href})${trail}`;
  });
}

/** Add clickable links to bare URLs in an already-rendered HTML string, skipping existing <a> tags. */
export function linkifyHtml(html: string): string {
  // Ensure all existing <a> tags open in a new tab
  const withTargets = html.replace(/<a\s(?![^>]*target=)/gi, '<a target="_blank" rel="noopener noreferrer" ');
  const parts = withTargets.split(/(<a[\s\S]*?<\/a>)/gi);
  return parts
    .map((part, i) => {
      if (i % 2 === 1) return part; // already an <a> — leave alone
      return part.replace(new RegExp(URL_RE.source, 'gi'), (url) => {
        const clean = url.replace(/[.,;:!?)\]]+$/, '');
        const trail = url.slice(clean.length);
        const href = /^https?:\/\//i.test(clean) ? clean : `https://${clean}`;
        return `<a href="${href}" target="_blank" rel="noopener noreferrer">${clean}</a>${trail}`;
      });
    })
    .join('');
}
