export function escapeInlineScript(source) {
  return source.replace(/<!--|<\/?script/gi, match => '\\x3c' + match.slice(1));
}
