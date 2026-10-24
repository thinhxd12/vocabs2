/**
 * Highlights are stored as light HTML (`<p>`, `<cite>`, …) so the printed page
 * can style them. Strip the executable parts before that markup reaches
 * `{@html}`: the content is the reader's own, but a malformed clippings file
 * should not be able to run script in the app.
 */
export function safeHighlightHtml(html: string) {
	return html
		.replace(
			/<\s*(script|style|iframe|object|embed|link|meta|form)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi,
			''
		)
		.replace(/<\s*(script|style|iframe|object|embed|link|meta|form)\b[^>]*\/?>/gi, '')
		.replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|"[^"]*"|[^\s>]+)/gi, '')
		.replace(
			/\s(?:href|src|xlink:href)\s*=\s*(?:"\s*javascript:[^"]*"|'\s*javascript:[^']*'|javascript:[^\s>]+)/gi,
			''
		);
}
