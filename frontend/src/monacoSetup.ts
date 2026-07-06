import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'

self.MonacoEnvironment = {
  getWorker() {
    return new editorWorker()
  },
}

loader.config({ monaco })

monaco.editor.defineTheme('novelist-light', {
  base: 'vs',
  inherit: true,
  rules: [
    { token: '', foreground: '3f3926', background: 'f5efd7' },
  ],
  colors: {
    'editor.background': '#f5efd7',
    'editor.foreground': '#3f3926',
    'editorLineNumber.foreground': '#91835d',
    'editorCursor.foreground': '#5f7138',
    'editor.selectionBackground': '#d9c991',
    'editor.inactiveSelectionBackground': '#ebe0b9',
    'editor.lineHighlightBackground': '#efe5c6',
    'editorIndentGuide.background1': '#dccfa6',
    'editorIndentGuide.activeBackground1': '#a99b69',
    'editorWidget.background': '#fbf6e8',
    'editorWidget.border': '#d4c69a',
    'input.background': '#fbf6e8',
    'input.border': '#d4c69a',
  },
})
