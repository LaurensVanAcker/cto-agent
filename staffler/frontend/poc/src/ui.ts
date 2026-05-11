/**
 * Tiny DOM helpers — geen virtual-DOM, geen framework. Net genoeg om
 * de PoC leesbaar te houden.
 */

export function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Element not found: #${id}`);
  return el as T;
}

export function setOutput(content: unknown): void {
  const out = $('output');
  out.textContent = typeof content === 'string'
    ? content
    : JSON.stringify(content, null, 2);
}

export function appendOutput(prefix: string, content: unknown): void {
  const out = $('output');
  const formatted = typeof content === 'string'
    ? content
    : JSON.stringify(content, null, 2);
  const ts = new Date().toLocaleTimeString('nl-BE', { hour12: false });
  out.textContent = `[${ts}] ${prefix}\n${formatted}\n\n${out.textContent ?? ''}`.trim();
}

export function setAuthState(text: string): void {
  $('auth-state').textContent = text;
}

export function showLoggedIn(name: string): void {
  $('login-block').hidden = true;
  $('logged-in-block').hidden = false;
  $('user-name').textContent = name;
}

export function showLoggedOut(): void {
  $('login-block').hidden = false;
  $('logged-in-block').hidden = true;
  $('user-name').textContent = '';
}

export function setLoginError(msg: string): void {
  $('login-err').textContent = msg;
}

export function clearOutput(): void {
  $('output').textContent = '// Cleared';
}
