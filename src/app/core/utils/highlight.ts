/**
 * Tiny dependency-free syntax highlighter for the code blocks in lessons and
 * questions. Supports T-SQL (default), JSON and a generic fallback.
 * Returns HTML with <span class="tok-*"> markers; input is fully escaped first.
 */

const SQL_KEYWORDS = new Set(
  (
    'SELECT FROM WHERE GROUP BY ORDER HAVING TOP DISTINCT AS JOIN INNER LEFT RIGHT FULL OUTER CROSS APPLY ON ' +
    'INSERT INTO VALUES UPDATE SET DELETE MERGE OUTPUT DECLARE BEGIN END IF ELSE WHILE RETURN RETURNS EXEC EXECUTE ' +
    'CREATE ALTER DROP TABLE VIEW INDEX PROCEDURE PROC FUNCTION TRIGGER SCHEMA DATABASE SEQUENCE PARTITION ' +
    'PRIMARY KEY FOREIGN REFERENCES UNIQUE CHECK DEFAULT CONSTRAINT IDENTITY NOT NULL AND OR IN IS LIKE BETWEEN EXISTS ' +
    'UNION ALL EXCEPT INTERSECT CASE WHEN THEN OVER ROW_NUMBER RANK DENSE_RANK NTILE LAG LEAD FIRST_VALUE LAST_VALUE ' +
    'WITH CTE TRY CATCH THROW RAISERROR TRANSACTION TRAN COMMIT ROLLBACK SAVE ISOLATION LEVEL SNAPSHOT SERIALIZABLE ' +
    'READ COMMITTED UNCOMMITTED REPEATABLE GRANT REVOKE DENY TO USER ROLE LOGIN ADD COLUMN CLUSTERED NONCLUSTERED ' +
    'COLUMNSTORE INCLUDE ASC DESC OFFSET FETCH NEXT ROWS ONLY PIVOT UNPIVOT OPENJSON OPENROWSET CROSS GO USE ' +
    'VECTOR EMBEDDING MODEL EXTERNAL MASKED FILTER PREDICATE SECURITY POLICY AUDIT SERVER TYPE ENABLE DISABLE ' +
    'FOR SYSTEM_TIME PERIOD GENERATED ALWAYS HIDDEN LEDGER NODE EDGE MATCH GRAPH FREETEXT CONTAINS FULLTEXT CATALOG ' +
    'TRUNCATE CAST CONVERT TRY_CAST TRY_CONVERT COALESCE NULLIF IIF CHOOSE'
  ).split(/\s+/),
);

const SQL_FUNCTIONS =
  /\b(JSON_OBJECT|JSON_ARRAY|JSON_ARRAYAGG|JSON_OBJECTAGG|JSON_VALUE|JSON_QUERY|JSON_MODIFY|JSON_PATH_EXISTS|JSON_CONTAINS|ISJSON|STRING_AGG|STRING_SPLIT|CONCAT|CONCAT_WS|FORMAT|GETDATE|GETUTCDATE|SYSDATETIME|SYSUTCDATETIME|DATEADD|DATEDIFF|DATEPART|DATENAME|EOMONTH|COUNT|SUM|AVG|MIN|MAX|NEWID|NEWSEQUENTIALID|LEN|DATALENGTH|SUBSTRING|REPLACE|TRANSLATE|UPPER|LOWER|LTRIM|RTRIM|TRIM|CHARINDEX|PATINDEX|ABS|CEILING|FLOOR|ROUND|POWER|SQRT|REGEXP_LIKE|REGEXP_REPLACE|REGEXP_SUBSTR|REGEXP_INSTR|REGEXP_COUNT|REGEXP_MATCHES|REGEXP_SPLIT_TO_TABLE|EDIT_DISTANCE|EDIT_DISTANCE_SIMILARITY|JARO_WINKLER_DISTANCE|JARO_WINKLER_SIMILARITY|VECTOR_DISTANCE|VECTOR_NORMALIZE|VECTORPROPERTY|VECTOR_SEARCH|AI_GENERATE_EMBEDDINGS|AI_GENERATE_CHUNKS|FREETEXTTABLE|CONTAINSTABLE|OBJECT_ID|SCOPE_IDENTITY|ERROR_MESSAGE|ERROR_NUMBER|ERROR_SEVERITY|ERROR_STATE|ERROR_LINE|ERROR_PROCEDURE|XACT_STATE|ROWCOUNT_BIG|COMPRESS|DECOMPRESS|HASHBYTES|ENCRYPTBYKEY|DECRYPTBYKEY|SESSION_CONTEXT|USER_NAME|SUSER_SNAME|ORIGINAL_LOGIN|IS_MEMBER|IS_ROLEMEMBER|CHANGETABLE|CHANGE_TRACKING_CURRENT_VERSION|CHANGE_TRACKING_MIN_VALID_VERSION)\b/i;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

interface Tok {
  re: RegExp;
  cls: string | ((m: string) => string);
}

const SQL_TOKENS: Tok[] = [
  { re: /^--[^\n]*/, cls: 'tok-comment' },
  { re: /^\/\*[\s\S]*?\*\//, cls: 'tok-comment' },
  { re: /^N?'(?:[^']|'')*'/, cls: 'tok-string' },
  { re: /^\[[^\]\n]*\]/, cls: 'tok-ident' },
  { re: /^@@?\w+/, cls: 'tok-var' },
  { re: /^\b\d+(?:\.\d+)?\b/, cls: 'tok-number' },
  {
    re: /^\b[A-Za-z_][A-Za-z0-9_]*\b/,
    cls: (m) =>
      SQL_KEYWORDS.has(m.toUpperCase())
        ? 'tok-keyword'
        : SQL_FUNCTIONS.test(m)
          ? 'tok-func'
          : '',
  },
];

const JSON_TOKENS: Tok[] = [
  { re: /^"(?:[^"\\]|\\.)*"(?=\s*:)/, cls: 'tok-key' },
  { re: /^"(?:[^"\\]|\\.)*"/, cls: 'tok-string' },
  { re: /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/, cls: 'tok-number' },
  { re: /^\b(true|false|null)\b/, cls: 'tok-keyword' },
  { re: /^\/\/[^\n]*/, cls: 'tok-comment' },
];

function tokenize(code: string, tokens: Tok[]): string {
  let out = '';
  let rest = code;
  outer: while (rest.length > 0) {
    for (const t of tokens) {
      const m = t.re.exec(rest);
      if (m && m.index === 0) {
        const cls = typeof t.cls === 'function' ? t.cls(m[0]) : t.cls;
        const esc = escapeHtml(m[0]);
        out += cls ? `<span class="${cls}">${esc}</span>` : esc;
        rest = rest.slice(m[0].length);
        continue outer;
      }
    }
    out += escapeHtml(rest[0]);
    rest = rest.slice(1);
  }
  return out;
}

/** Highlight `code` as `lang` ('sql' default, 'json', anything else = escaped). */
export function highlight(code: string, lang = 'sql'): string {
  const normalized = code.replace(/\r\n/g, '\n');
  switch (lang) {
    case 'sql':
    case 'tsql':
      return tokenize(normalized, SQL_TOKENS);
    case 'json':
      return tokenize(normalized, JSON_TOKENS);
    default:
      return escapeHtml(normalized);
  }
}

/**
 * Minimal inline-markdown renderer for lesson/explanation text:
 * **bold**, *italic*, `code`, line breaks, "- " bullet lists, [text](url).
 * Everything is escaped first; only our own tags are emitted.
 */
export function renderRichText(text: string): string {
  const esc = escapeHtml(text);
  const lines = esc.split(/\n/);
  const out: string[] = [];
  let inList = false;
  for (const line of lines) {
    const bullet = /^\s*-\s+(.*)$/.exec(line);
    if (bullet) {
      if (!inList) {
        out.push('<ul>');
        inList = true;
      }
      out.push(`<li>${inline(bullet[1])}</li>`);
    } else {
      if (inList) {
        out.push('</ul>');
        inList = false;
      }
      if (line.trim().length === 0) {
        out.push('<br>');
      } else {
        out.push(`<p>${inline(line)}</p>`);
      }
    }
  }
  if (inList) out.push('</ul>');
  return out.join('');
}

function inline(s: string): string {
  return s
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(
      /\[([^\]]+)\]\((https?:[^)\s]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener">$1</a>',
    );
}
