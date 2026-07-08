import assert from 'node:assert/strict'

const interactiveSelector = [
  'button',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  'a[href]',
  '[role="button"]',
  '[role="checkbox"]',
  '[role="switch"]',
  '[role="tab"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export async function assertNoUnnamedVisibleInteractiveControls(root, description) {
  const controls = root.locator(interactiveSelector)
  const issues = await controls.evaluateAll((nodes) => {
    function isVisible(element) {
      if (element.closest('[aria-hidden="true"]')) return false
      if (element.hasAttribute('hidden')) return false
      const style = window.getComputedStyle(element)
      if (style.display === 'none' || style.visibility === 'hidden') return false
      const box = element.getBoundingClientRect()
      return box.width > 0 && box.height > 0
    }

    function textFromIds(ownerDocument, ids) {
      return ids
        .split(/\s+/)
        .map(id => ownerDocument.getElementById(id)?.textContent?.trim() ?? '')
        .filter(Boolean)
        .join(' ')
        .trim()
    }

    function accessibleName(element) {
      const ariaLabelledBy = element.getAttribute('aria-labelledby')
      if (ariaLabelledBy) {
        const text = textFromIds(element.ownerDocument, ariaLabelledBy)
        if (text) return text
      }

      const ariaLabel = element.getAttribute('aria-label')?.trim()
      if (ariaLabel) return ariaLabel

      if ('labels' in element && element.labels?.length) {
        const text = Array.from(element.labels)
          .map(label => label.textContent?.trim() ?? '')
          .filter(Boolean)
          .join(' ')
          .trim()
        if (text) return text
      }

      const title = element.getAttribute('title')?.trim()
      if (title) return title

      const tagName = element.tagName.toLowerCase()
      const role = element.getAttribute('role')?.trim()
      const type = element.getAttribute('type')?.trim().toLowerCase()
      if (tagName === 'button' || tagName === 'a' || role === 'button' || type === 'button' || type === 'submit' || type === 'reset') {
        const text = element.textContent?.trim()
        if (text) return text
      }

      const value = element.getAttribute('value')?.trim()
      if ((type === 'button' || type === 'submit' || type === 'reset') && value) return value

      return ''
    }

    function controlLabel(element, index) {
      const tagName = element.tagName.toLowerCase()
      const role = element.getAttribute('role')
      const type = element.getAttribute('type')
      const text = element.textContent?.replace(/\s+/g, ' ').trim().slice(0, 80)
      return `${index + 1}: <${tagName}${type ? ` type="${type}"` : ''}${role ? ` role="${role}"` : ''}> ${text ?? ''}`.trim()
    }

    return nodes
      .map((element, index) => ({ element, index }))
      .filter(({ element }) => isVisible(element))
      .filter(({ element }) => !accessibleName(element))
      .map(({ element, index }) => controlLabel(element, index))
  })

  assert.deepEqual(issues, [], `${description} has visible interactive controls without accessible names:\n${issues.join('\n')}`)
}

export async function assertErrorCalloutAccessibility(page, alert, description) {
  const role = await alert.getAttribute('role')
  assert.equal(role, 'alert', `${description} must render with role="alert".`)
  await assertNoUnnamedVisibleInteractiveControls(alert, description)

  const copyButton = alert.getByRole('button', { name: '复制错误诊断' })
  if (await copyButton.isVisible().catch(() => false)) {
    await copyButton.focus()
    const focusedName = await page.evaluate(() => {
      const active = document.activeElement
      if (!active) return ''
      return active.getAttribute('aria-label') || active.textContent?.trim() || ''
    })
    assert.match(focusedName, /复制错误诊断/, `${description} copy action must be keyboard focusable.`)
  }
}
