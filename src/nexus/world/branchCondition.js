/**
 * JARVIS NEXUS — Scenario branch condition evaluator (shared, pure, no eval).
 *
 * Grammar (whitespace-insensitive):
 *   expr       := and ( '||' and )*
 *   and        := unary ( '&&' unary )*
 *   unary      := '!' unary | '(' expr ')' | comparison
 *   comparison := IDENT ( '<=' | '>=' | '==' | '!=' | '<' | '>' ) NUMBER
 *
 * The keywords `and` / `or` / `not` (any case) are accepted as && / || / !.
 * An empty condition or the literal `otherwise` matches everything (catch-all).
 *
 * A condition that cannot be parsed evaluates to FALSE — a branch never
 * matches "by accident". (Audit bug B3: the previous evaluator only split on
 * '||' and silently failed on `and` conditions, so the Media Wall always
 * showed the safe branch while the 3D stage publicly ruptured.)
 *
 * Example: 'line_pressure_mpa >= 185 and relief_valve_ms > 70'
 */

const COMPARISON_RE = /^([A-Za-z_]\w*)\s*(<=|>=|==|!=|<|>)\s*(-?\d+(?:\.\d+)?)/;

export function evalBranchCondition(cond, vars) {
  const raw = cond == null ? '' : String(cond).trim();
  if (!raw || raw === 'otherwise') return true;

  const src = raw
    .replace(/\b(and|AND)\b/g, '&&')
    .replace(/\b(or|OR)\b/g, '||')
    .replace(/\b(not|NOT)\b/g, '!');

  let i = 0;
  const n = src.length;
  const skipWs = () => { while (i < n && /\s/.test(src[i])) i++; };

  function parseOr() {
    let v = parseAnd();
    for (;;) {
      skipWs();
      if (src.startsWith('||', i)) {
        i += 2;
        const r = parseAnd();
        v = v || r;
      } else {
        return v;
      }
    }
  }

  function parseAnd() {
    let v = parseUnary();
    for (;;) {
      skipWs();
      if (src.startsWith('&&', i)) {
        i += 2;
        const r = parseUnary();
        v = v && r;
      } else {
        return v;
      }
    }
  }

  function parseUnary() {
    skipWs();
    if (src[i] === '!' && src[i + 1] !== '=') {
      i++;
      return !parseUnary();
    }
    if (src[i] === '(') {
      i++;
      const v = parseOr();
      skipWs();
      if (src[i] === ')') i++;
      return v;
    }
    const m = COMPARISON_RE.exec(src.slice(i));
    if (!m) {
      i = n; // unparseable tail: fail safe (false), never guess a match
      return false;
    }
    i += m[0].length;
    const val = Number(vars ? vars[m[1]] : undefined);
    const ref = Number(m[3]);
    if (!Number.isFinite(val)) return false;
    switch (m[2]) {
      case '<=': return val <= ref;
      case '>=': return val >= ref;
      case '==': return val === ref;
      case '!=': return val !== ref;
      case '<':  return val < ref;
      case '>':  return val > ref;
      default:   return false;
    }
  }

  const result = parseOr();
  skipWs();
  return Boolean(result);
}
