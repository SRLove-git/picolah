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
              {renderBold(line, `${index}-${lineIndex}`)}
            </span>
          ))}
        </p>
      ))}
    </div>
  );
}
