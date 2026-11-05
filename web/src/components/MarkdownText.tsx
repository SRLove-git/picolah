import type { ReactNode } from 'react';

function renderBold(text: string, keyPrefix: string): ReactNode[] {
  const parts = text.split(/(\*\*.+?\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={`${keyPrefix}-${index}`} className="md-strong">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={`${keyPrefix}-${index}`}>{part}</span>;
  });
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const links = /\[([^\]\n]+)\]\(<?(https?:\/\/[^\s<>]+?)>?\)/g;
  let offset = 0;
  for (const match of text.matchAll(links)) {
    nodes.push(...renderBold(text.slice(offset, match.index), `${keyPrefix}-${offset}`));
    let safe = false;
    try {
      const url = new URL(match[2]);
      safe = ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password;
    } catch { /* Invalid links remain visible as text. */ }
    nodes.push(safe
      ? <a key={`${keyPrefix}-link-${match.index}`} href={match[2]} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline', overflowWrap: 'anywhere' }}>{match[1]}</a>
      : <span key={`${keyPrefix}-link-${match.index}`}>{match[0]}</span>);
    offset = match.index + match[0].length;
  }
  nodes.push(...renderBold(text.slice(offset), `${keyPrefix}-${offset}`));
  return nodes;
}

export function MarkdownText({ text }: { text: string }) {
  const clean = text.replace(/`/g, '');
  const paragraphs = clean.split(/\n{2,}/).filter((paragraph) => paragraph.trim());

  return (
    <div className="markdown-copy">
      {paragraphs.map((paragraph, index) => (
        <p key={index}>
          {paragraph.split('\n').map((line, lineIndex) => (
            <span key={lineIndex}>
              {lineIndex > 0 && <br />}
              {renderInline(line, `${index}-${lineIndex}`)}
            </span>
          ))}
        </p>
      ))}
    </div>
  );
}
