import Editor, { type OnMount } from '@monaco-editor/react'

interface Props {
  value: string
  onChange: (value: string | undefined) => void
  onMount: OnMount
}

export default function ContentEditor({ value, onChange, onMount }: Props) {
  return (
    <Editor
      height="100%"
      language="markdown"
      theme="light"
      value={value}
      onChange={onChange}
      onMount={onMount}
      options={{
        minimap: { enabled: false },
        lineNumbers: 'on',
        scrollBeyondLastLine: false,
        fontSize: 17,
        lineHeight: 30,
        fontFamily: "'Noto Serif SC', 'Source Han Serif SC', serif",
        wordWrap: 'on',
        automaticLayout: true,
        unicodeHighlight: { nonBasicASCII: false, ambiguousCharacters: false, invisibleCharacters: false },
      }}
    />
  )
}
