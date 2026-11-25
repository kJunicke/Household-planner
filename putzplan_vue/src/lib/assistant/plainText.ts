/**
 * Der Chat zeigt reinen Text. Schreibt Claude trotz Systemprompt Markdown,
 * fallen die einfachen Zeichen weg, die sonst roh dastünden: Fett (`**`, `__`)
 * und Überschriften (`#`). Ein einzelnes `*` bleibt, es kann gemeint sein.
 */
export const withoutMarkdown = (text: string) =>
  text
    .replace(/\*\*(?=\S)(.+?)(?<=\S)\*\*/g, '$1')
    .replace(/__(?=\S)(.+?)(?<=\S)__/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
