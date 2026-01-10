/**
 * Simple syntax highlighter for diff viewer
 * Applies basic token-based highlighting for common languages
 */

// Keywords for common languages
const KEYWORDS = new Set([
  // JavaScript/TypeScript
  'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'do',
  'switch', 'case', 'break', 'continue', 'try', 'catch', 'finally', 'throw',
  'class', 'extends', 'implements', 'interface', 'type', 'enum', 'export', 'import',
  'from', 'as', 'default', 'async', 'await', 'new', 'this', 'super', 'static',
  'public', 'private', 'protected', 'readonly', 'abstract', 'typeof', 'instanceof',
  'in', 'of', 'void', 'null', 'undefined', 'true', 'false',
  // Python
  'def', 'class', 'if', 'elif', 'else', 'for', 'while', 'try', 'except', 'finally',
  'with', 'as', 'import', 'from', 'return', 'yield', 'lambda', 'and', 'or', 'not',
  'is', 'in', 'True', 'False', 'None', 'self', 'pass', 'raise', 'assert',
  // Common
  'module', 'require', 'exports', 'package', 'struct', 'impl'
]);

const TYPES = new Set([
  'string', 'number', 'boolean', 'object', 'any', 'void', 'never', 'unknown',
  'Array', 'Map', 'Set', 'Promise', 'Record', 'Partial', 'Required', 'Readonly',
  'int', 'float', 'double', 'char', 'bool', 'str', 'list', 'dict', 'tuple'
]);

interface Token {
  type: 'keyword' | 'type' | 'string' | 'comment' | 'number' | 'operator' | 'punctuation' | 'text';
  value: string;
}

export function tokenize(line: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < line.length) {
    // Skip leading +/- for diff lines
    if (i === 0 && (line[0] === '+' || line[0] === '-')) {
      i++;
      continue;
    }

    // Whitespace
    if (/\s/.test(line[i])) {
      let ws = '';
      while (i < line.length && /\s/.test(line[i])) {
        ws += line[i++];
      }
      tokens.push({ type: 'text', value: ws });
      continue;
    }

    // Single-line comment
    if (line.slice(i, i + 2) === '//' || line[i] === '#') {
      tokens.push({ type: 'comment', value: line.slice(i) });
      break;
    }

    // Multi-line comment start (just highlight the line part)
    if (line.slice(i, i + 2) === '/*' || line.slice(i, i + 3) === '/**') {
      const end = line.indexOf('*/', i + 2);
      if (end !== -1) {
        tokens.push({ type: 'comment', value: line.slice(i, end + 2) });
        i = end + 2;
      } else {
        tokens.push({ type: 'comment', value: line.slice(i) });
        break;
      }
      continue;
    }

    // String (single or double quote)
    if (line[i] === '"' || line[i] === "'" || line[i] === '`') {
      const quote = line[i];
      let str = quote;
      i++;
      while (i < line.length && line[i] !== quote) {
        if (line[i] === '\\' && i + 1 < line.length) {
          str += line[i++];
        }
        str += line[i++];
      }
      if (i < line.length) str += line[i++];
      tokens.push({ type: 'string', value: str });
      continue;
    }

    // Number
    if (/\d/.test(line[i]) || (line[i] === '.' && /\d/.test(line[i + 1] || ''))) {
      let num = '';
      while (i < line.length && /[\d.xXa-fA-F]/.test(line[i])) {
        num += line[i++];
      }
      tokens.push({ type: 'number', value: num });
      continue;
    }

    // Identifier or keyword
    if (/[a-zA-Z_$]/.test(line[i])) {
      let ident = '';
      while (i < line.length && /[a-zA-Z0-9_$]/.test(line[i])) {
        ident += line[i++];
      }
      if (KEYWORDS.has(ident)) {
        tokens.push({ type: 'keyword', value: ident });
      } else if (TYPES.has(ident)) {
        tokens.push({ type: 'type', value: ident });
      } else {
        tokens.push({ type: 'text', value: ident });
      }
      continue;
    }

    // Operators
    if (/[+\-*/%=<>!&|^~?:]/.test(line[i])) {
      let op = line[i++];
      // Multi-char operators
      while (i < line.length && /[+\-*/%=<>!&|^~?:]/.test(line[i])) {
        op += line[i++];
      }
      tokens.push({ type: 'operator', value: op });
      continue;
    }

    // Punctuation
    if (/[{}[\]();,.]/.test(line[i])) {
      tokens.push({ type: 'punctuation', value: line[i++] });
      continue;
    }

    // Fallback - single char
    tokens.push({ type: 'text', value: line[i++] });
  }

  return tokens;
}

// CSS classes for each token type
export const TOKEN_CLASSES: Record<Token['type'], string> = {
  keyword: 'text-purple-400 font-semibold',
  type: 'text-cyan-400',
  string: 'text-amber-400',
  comment: 'text-gray-500 italic',
  number: 'text-orange-400',
  operator: 'text-primary/80',
  punctuation: 'text-primary/60',
  text: ''
};
