#!/usr/bin/env node
// Reconcile every staffAccounts entry against the CURRENT Toast job assignment.
//   - Has a manager-tier job → role=manager, active.
//   - Else has a trainer job → role=trainer, active.
//   - Else (or not in Toast, or Toast-side duplicate of a canonical winner) → archived.
//   - admin/owner roles are preserved (not derived from Toast).
// Dry-run first.

const admin = require('firebase-admin');
const https = require('https');
const SERVICE_ACCOUNT = require('/Users/adamstandridge/Documents/projects/service-account.json');

const DRY_RUN = process.argv.includes('--dry-run');
const API_BASE = 'https://us-central1-chartrain-20901.cloudfunctions.net';
const STORES = {
  Westfield: '86326c13-2905-455f-924a-a970ba974785',
  Castleton: 'b2965271-1d9f-4507-a427-0451c2e54cbf',
};

admin.initializeApp({ credential: admin.credential.cert(SERVICE_ACCOUNT) });
const db = admin.firestore();

function httpJson(method, url, body = null) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname, path: u.pathname + u.search, method,
      headers: { 'Content-Type': 'application/json' },
    }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (_) { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function classifyTier(jobTitles) {
  // Returns 'manager' | 'trainer' | 'other'
  for (const t of jobTitles) {
    const lower = String(t || '').toLowerCase();
    if (lower.includes('manager') || lower.includes('key hourly') || lower.includes('key manager')) return 'manager';
  }
  for (const t of jobTitles) {
    if (String(t || '').toLowerCase().includes('trainer')) return 'trainer';
  }
  return 'other';
}

(async () => {
  console.log(`=== Role reconciliation (${DRY_RUN ? 'DRY RUN' : 'LIVE'}) ===\n`);

  // 1. Auth + fetch Toast data for both stores
  const auth = await httpJson('POST', `${API_BASE}/toastAuth`, {});
  if (auth.status !== 200 || !auth.body?.accessToken) { console.error('toastAuth FAIL', auth); process.exit(1); }
  console.log('[1] Toast auth OK.\n');

  const toastByGuid = new Map();   // guid -> { firstName, lastName, externalEmployeeId, store, tier, modifiedDate, deleted }
  const toastByEmpNumStore = new Map(); // `${empNum}|${store}` -> guid (active only)

  for (const [storeName, restaurantGuid] of Object.entries(STORES)) {
    const [eRes, jRes] = await Promise.all([
      httpJson('GET', `${API_BASE}/toastEmployees?restaurantGuid=${restaurantGuid}`),
      httpJson('GET', `${API_BASE}/toastJobs?restaurantGuid=${restaurantGuid}`),
    ]);
    const employees = eRes.body?.data ?? eRes.body?.employees ?? eRes.body ?? [];
    const jobs = jRes.body?.data ?? jRes.body?.jobs ?? jRes.body ?? [];
    const jobMap = {};
    (Array.isArray(jobs) ? jobs : []).forEach((j) => {
      const guid = j.guid ?? j.id; if (guid) jobMap[String(guid)] = j.title ?? j.name ?? '';
    });
    console.log(`[2] ${storeName}: ${employees.length} employees, ${Object.keys(jobMap).length} jobs.`);
    (Array.isArray(employees) ? employees : []).forEach((e) => {
      const g = String(e.guid ?? ''); if (!g) return;
      const en = String(e.externalEmployeeId ?? '').trim();
      const refs = e.jobReferences ?? e.jobs ?? [];
      const refList = Array.isArray(refs) ? refs : [];
      const titles = refList.map((ref) => {
        const jGuid = ref.guid ?? ref.jobGuid ?? ref;
        return jobMap[String(jGuid)] ?? ref.title ?? ref.name ?? '';
      });
      const tier = classifyTier(titles);
      toastByGuid.set(g, {
        guid: g,
        firstName: e.firstName ?? '',
        lastName: e.lastName ?? '',
        externalEmployeeId: en,
        store: storeName,
        tier,
        deleted: e.deleted === true,
        modifiedDate: e.modifiedDate ?? '',
        titles,
      });
      if (en && e.deleted !== true) toastByEmpNumStore.set(`${en}|${storeName}`, g);
    });
  }

  // Canonical winner per name (newest modifiedDate wins)
  const nameBuckets = new Map();
  for (const t of toastByGuid.values()) {
    if (t.deleted) continue;
    const k = `${t.firstName.trim().toLowerCase()}|${t.lastName.trim().toLowerCase()}`;
    if (!k.replace('|', '')) continue;
    if (!nameBuckets.has(k)) nameBuckets.set(k, []);
    nameBuckets.get(k).push(t);
  }
  const canonicalGuids = new Set();
  for (const bucket of nameBuckets.values()) {
    bucket.sort((a, b) => {
      if (a.modifiedDate !== b.modifiedDate) return a.modifiedDate < b.modifiedDate ? 1 : -1;
      const an = parseInt(a.externalEmployeeId, 10), bn = parseInt(b.externalEmployeeId, 10);
      if (!isNaN(an) && !isNaN(bn) && an !== bn) return an - bn;
      return 0;
    });
    canonicalGuids.add(bucket[0].guid);
  }
  console.log(`  ${canonicalGuids.size} canonical Toast employees\n`);

  // 2. Walk staffAccounts.data
  const cfgRef = db.collection('config').doc('staffAccounts');
  const cfgSnap = await cfgRef.get();
  const accts = (cfgSnap.data() || {}).data || {};
  console.log(`[3] Reviewing ${Object.keys(accts).length} staffAccounts entries...\n`);

  const changes = []; // { key, before: {...}, after: {...}, reason }
  for (const [key, info] of Object.entries(accts)) {
    if (!info || typeof info !== 'object') continue;
    if (info.role === 'admin' || info.role === 'owner') continue; // preserved

    const currentRole = info.role;
    const currentArchived = !!info.archived;
    const store = info.store;

    // Find their current Toast record (by toastGuid first, then by empNum+store)
    let toast = null;
    if (info.toastGuid) toast = toastByGuid.get(String(info.toastGuid));
    if (!toast && store) toast = toastByGuid.get(toastByEmpNumStore.get(`${key}|${store}`));

    let targetRole = currentRole;
    let targetArchived = currentArchived;
    let reason = '';

    if (!toast || toast.deleted) {
      // Not in Toast (or terminated) → archive (real removal)
      targetArchived = true;
      reason = 'not in Toast (or deleted=true)';
    } else if (!canonicalGuids.has(toast.guid)) {
      // Toast-side duplicate of someone else → archive (canonical wins)
      targetArchived = true;
      reason = `Toast-side duplicate (canonical is a different record for ${toast.firstName} ${toast.lastName})`;
    } else if (toast.tier === 'manager') {
      targetRole = 'manager';
      targetArchived = false;
      reason = `Toast tier=manager (jobs: ${toast.titles.join(', ')})`;
    } else if (toast.tier === 'trainer') {
      targetRole = 'trainer';
      targetArchived = false;
      reason = `Toast tier=trainer (jobs: ${toast.titles.join(', ')})`;
    } else {
      // Active in Toast but no manager/trainer job code → not archived, just doesn't qualify
      // for those views. Role demoted to 'staff' so they don't surface in manager/trainer lists.
      targetRole = 'staff';
      targetArchived = false;
      reason = `Toast tier=other — demoted to role=staff (no manager/trainer job: ${toast.titles.join(', ') || '(no jobs)'})`;
    }

    if (targetRole !== currentRole || targetArchived !== currentArchived) {
      changes.push({
        key,
        name: info.name,
        store: info.store,
        before: { role: currentRole, archived: currentArchived },
        after: { role: targetRole, archived: targetArchived },
        reason,
      });
    }
  }

  // 3. Report
  const demotedToStaff = changes.filter((c) => c.after.role === 'staff' && !c.after.archived);
  const archived = changes.filter((c) => !c.before.archived && c.after.archived);
  const promotedToManager = changes.filter((c) => c.before.role !== 'manager' && c.after.role === 'manager' && !c.after.archived);
  const promotedToTrainer = changes.filter((c) => c.before.role !== 'trainer' && c.after.role === 'trainer' && !c.after.archived);
  const unarchived = changes.filter((c) => c.before.archived && !c.after.archived);

  console.log(`[4] Summary of changes:`);
  console.log(`    → role=staff (no manager/trainer job): ${demotedToStaff.length}`);
  console.log(`    → role=manager (new): ${promotedToManager.length}`);
  console.log(`    → role=trainer (new): ${promotedToTrainer.length}`);
  console.log(`    archived (not in Toast or duplicate): ${archived.length}`);
  console.log(`    un-archived: ${unarchived.length}`);
  console.log(`    total entries changing: ${changes.length}\n`);

  if (demotedToStaff.length) {
    console.log('--- Demoted to staff (active in Toast, no manager/trainer job code) ---');
    demotedToStaff.forEach((c) => console.log(`  ${c.name} (key=${c.key}, was role=${c.before.role} archived=${c.before.archived}, ${c.store}) — ${c.reason}`));
  }

  if (archived.length) {
    console.log('\n--- Newly archived (no manager/trainer job in Toast, or not in Toast) ---');
    archived.forEach((c) => console.log(`  ${c.name} (key=${c.key}, role was=${c.before.role}, ${c.store}) — ${c.reason}`));
  }
  if (promotedToManager.length) {
    console.log('\n--- Newly manager ---');
    promotedToManager.forEach((c) => console.log(`  ${c.name} (key=${c.key}, was=${c.before.role} archived=${c.before.archived}, ${c.store}) — ${c.reason}`));
  }
  if (promotedToTrainer.length) {
    console.log('\n--- Newly trainer ---');
    promotedToTrainer.forEach((c) => console.log(`  ${c.name} (key=${c.key}, was=${c.before.role} archived=${c.before.archived}, ${c.store}) — ${c.reason}`));
  }

  // 4. Write
  if (!DRY_RUN && changes.length) {
    const updates = { updatedAt: new Date().toISOString() };
    for (const c of changes) {
      const existing = accts[c.key];
      updates[`data.${c.key}`] = { ...existing, role: c.after.role, archived: c.after.archived };
    }
    await cfgRef.update(updates);
    console.log(`\nWROTE ${changes.length} entry update(s).`);
  }

  console.log(`\n=== Done (${DRY_RUN ? 'DRY RUN' : 'LIVE'}) ===`);
  process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
