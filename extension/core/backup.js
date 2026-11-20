import { validateSettings } from './policy.js';

export const MAX_BACKUP_BYTES = 1024 * 1024;

// Export policy only. Passwords, verifier, authorization, visits, and pending
// proposals must never move between installations through a settings backup.
export function settingsBackup(settings) {
  return { format: 'local-blocker-settings', version: 1, settings: validateSettings(settings) };
}

export function readBackup(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > MAX_BACKUP_BYTES) throw new Error('Choose a settings backup smaller than 1 MB.');
  let backup;
  try { backup = JSON.parse(text); } catch { throw new Error('This file is not valid JSON. Choose a Local Blocker settings backup.'); }
  if (!backup || backup.format !== 'local-blocker-settings' || backup.version !== 1 || Object.keys(backup).some(k => !['format', 'version', 'settings'].includes(k))) throw new Error('This is not a supported Local Blocker settings backup.');
  return validateSettings(backup.settings);
}
