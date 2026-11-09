// Pure presentation/deduplication helpers; no network, storage, or notification permission.
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export function detectionPresentation(item) {
  const kind = item.kind === 'app' ? 'Aplikasi' : item.kind === 'domain' ? 'Domain' : 'Target';
  const verdict = { known:'Cocok daftar aturan', personal:'Aturan pribadi peserta', suspected:'Diduga · perlu ditinjau' }[item.verdict] || 'Belum terverifikasi';
  const reason = { known_rule:'Cocok aturan yang dipasang di perangkat', personal_rule:'Aturan yang dipilih peserta', name_heuristic:'Indikasi dari nama; isi belum diverifikasi', ml_model:'Sinyal AI lokal, perlu ditinjau; isi belum diverifikasi' }[item.reason] || 'Alasan belum tersedia';
  const action = item.action === 'blocked' ? (item.kind === 'app' ? 'Pembukaan aplikasi diinterupsi' : 'Koneksi DNS diblokir') : 'Ditandai untuk ditinjau';
  return { kind, verdict, reason, action };
}

/**
 * Baselines each pair/grant before alerting. A delayed offline event remains in
 * the inbox but is not announced as fresh activity. IDs are memory-only and
 * reset when watching stops, the session ends, or the automation grant changes.
 */
export class DetectionNoticeTracker {
  constructor() { this.reset(); }
  reset() { this.key = null; this.seen = new Set(); }
  observe(pairingId, automation, items, now = Date.now()) {
    if (!pairingId || automation?.enabled !== true || !Number.isSafeInteger(automation.version)) { this.reset(); return []; }
    const key = JSON.stringify([pairingId, automation.version, [...(automation.scopes || [])].sort()]);
    const baseline = key !== this.key;
    if (baseline) { this.key = key; this.seen.clear(); }
    const fresh = [];
    for (const item of items || []) {
      if (typeof item.id !== 'string' || !item.id || this.seen.has(item.id)) continue;
      this.seen.add(item.id);
      const received = Date.parse(item.receivedAt), occurred = Date.parse(item.occurredAt);
      const current = value => Number.isFinite(value) && value >= now - 5 * 60_000 && value <= now + 60_000;
      if (!baseline && !item.readAt && current(received) && current(occurred)) fresh.push(item);
    }
    while (this.seen.size > 1000) this.seen.delete(this.seen.values().next().value);
    return fresh;
  }
}
