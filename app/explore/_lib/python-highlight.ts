// A tiny Python tokenizer for highlighting code blocks in Topic readings. Pure and client-safe.
// Good enough for teaching snippets: comments, strings (incl. f/r/b prefixes and triple quotes),
// numbers, keywords, builtins, function names, decorators, operators. Unknown text stays plain.

export type TokenKind =
  | "comment"
  | "string"
  | "number"
  | "keyword"
  | "constant"
  | "builtin"
  | "function"
  | "decorator"
  | "operator"
  | "punct"
  | "plain";

export type Token = { kind: TokenKind; text: string };

const KEYWORDS = new Set([
  "and", "as", "assert", "async", "await", "break", "class", "continue", "def", "del", "elif", "else", "except",
  "finally", "for", "from", "global", "if", "import", "in", "is", "lambda", "nonlocal", "not", "or", "pass",
  "raise", "return", "try", "while", "with", "yield", "match", "case",
]);
const CONSTANTS = new Set(["True", "False", "None"]);
const BUILTINS = new Set([
  "print", "input", "len", "range", "type", "int", "float", "str", "bool", "list", "dict", "set", "tuple",
  "abs", "round", "min", "max", "sum", "sorted", "reversed", "enumerate", "zip", "map", "filter", "isinstance",
  "open", "help", "id", "repr", "chr", "ord", "any", "all", "divmod", "pow", "format", "object", "super",
  "NameError", "SyntaxError", "IndentationError", "TabError", "TypeError", "ValueError", "ZeroDivisionError",
  "UnboundLocalError", "Exception", "KeyError", "IndexError", "RecursionError",
]);

// Order matters: comments and strings first so their contents aren't re-tokenized.
const RULES: [TokenKind, RegExp][] = [
  ["comment", /#[^\n]*/y],
  ["string", /(?:[rRbBuUfF]{1,2})?(?:"""[\s\S]*?(?:"""|$)|'''[\s\S]*?(?:'''|$)|"(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?)/y],
  ["number", /(?:0[xXoObB][\da-fA-F_]+|\d[\d_]*\.?\d*(?:[eE][+-]?\d+)?j?|\.\d+(?:[eE][+-]?\d+)?)/y],
  ["decorator", /@[A-Za-z_][\w.]*/y],
  ["plain", /[A-Za-z_]\w*/y], // identifiers, classified below
  ["operator", /\*\*=?|\/\/=?|->|:=|[=!<>]=|[+\-*/%@&|^~<>]=?|=/y],
  ["punct", /[()[\]{}:;,.]/y],
  ["plain", /\s+/y],
];

export function tokenizePython(code: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  const push = (kind: TokenKind, text: string) => {
    const prev = out[out.length - 1];
    if (prev && prev.kind === kind && (kind === "plain" || kind === "punct")) prev.text += text;
    else out.push({ kind, text });
  };
  while (i < code.length) {
    let matched = false;
    for (const [kind, re] of RULES) {
      re.lastIndex = i;
      const m = re.exec(code);
      if (!m || m[0].length === 0) continue;
      const text = m[0];
      if (kind === "plain" && /^[A-Za-z_]/.test(text)) push(classify(text, code, i + text.length, out), text);
      else push(kind, text);
      i += text.length;
      matched = true;
      break;
    }
    if (!matched) push("plain", code[i++]);
  }
  return out;
}

function classify(word: string, code: string, end: number, before: Token[]): TokenKind {
  if (CONSTANTS.has(word)) return "constant";
  if (KEYWORDS.has(word)) return "keyword";
  const prevWord = [...before].reverse().find((t) => t.text.trim() !== "");
  if (prevWord && (prevWord.text === "def" || prevWord.text === "class")) return "function";
  if (BUILTINS.has(word)) return "builtin";
  if (/^\s*\(/.test(code.slice(end, end + 8))) return "function";
  return "plain";
}
