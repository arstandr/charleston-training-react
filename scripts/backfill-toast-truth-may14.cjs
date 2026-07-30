#!/usr/bin/env node
// Backfill: align local state to Toast for both stores.
//   - For each locally-archived trainers/ doc OR staffAccounts entry, check Toast.
//   - If Toast still has the employee as deleted=false, un-archive locally.
//   - If Toast no longer has them, leave archived.
//
// Run with --dry-run first. No filter on Trainer/Manager — Toast=truth applies to anyone.

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
      hostname: u.hostname,
      path: u.pathname + u.search,
      method,
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

(async () => {
  console.log(`=== Toast = truth backfill (${DRY_RUN ? 'DRY RUN' : 'LIVE'}) ===\n`);

  // 1. Authenticate
  const authRes = await httpJson('POST', `${API_BASE}/toastAuth`, {});
  if (authRes.status !== 200 || !authRes.body?.accessToken) {
    console.error('FAIL — toastAuth:', authRes); process.exit(1);
  }
  console.log('[1] Toast auth OK.\n');

  // 2. Fetch employees from both stores. Build: byGuid (active records) + byEmpNum (active records, store-scoped).
  const toastByGuid = new Map();   // guid -> { firstName, lastName, externalEmployeeId, deleted, store }
  const toastByEmpNum = new Map(); // store -> Map(empNum -> guid)
  for (const [storeName, guid] of Object.entries(STORES)) {
    const r = await httpJson('GET', `${API_BASE}/toastEmployees?restaurantGuid=${guid}`);
    const employees = r.body?.data ?? r.body?.employees ?? r.body ?? [];
    if (!Array.isArray(employees)) { console.warn(`  WARN ${storeName}: bad employees response`); continue; }
    console.log(`[2] ${storeName}: ${employees.length} Toast employees`);
    const emap = new Map();
    for (const e of employees) {
      const g = String(e.guid ?? '');
      if (!g) continue;
      const en = String(e.externalEmployeeId ?? '').trim();
      const active = e.deleted !== true;
      toastByGuid.set(g, {
        guid: g,
        firstName: e.firstName ?? '',
        lastName: e.lastName ?? '',
        externalEmployeeId: en,
        deleted: e.deleted === true,
        store: storeName,
        modifiedDate: e.modifiedDate ?? e.modified_date ?? '',
      });
      if (en && active) emap.set(en, g);
    }
    toastByEmpNum.set(storeName, emap);
  }
  console.log(`  total Toast records: ${toastByGuid.size}\n`);

  // 2b. Build the canonical-winner set: for each (firstName+lastName) appearing in Toast,
  // pick the single canonical guid (newest modifiedDate, tiebreak lowest empNum).
  // Any archived record whose toastGuid isn't a canonical winner stays archived — that's
  // how we keep Toast-side duplicates (James Uribe #45471) from sneaking back in.
  const nameToCandidates = new Map();
  for (const t of toastByGuid.values()) {
    if (t.deleted) continue;
    const k = `${(t.firstName || '').trim().toLowerCase()}|${(t.lastName || '').trim().toLowerCase()}`;
    if (!k.replace('|', '')) continue;
    if (!nameToCandidates.has(k)) nameToCandidates.set(k, []);
    nameToCandidates.get(k).push(t);
  }
  const canonicalGuids = new Set();
  for (const [k, bucket] of nameToCandidates.entries()) {
    bucket.sort((a, b) => {
      if (a.modifiedDate !== b.modifiedDate) return a.modifiedDate < b.modifiedDate ? 1 : -1;
      const an = parseInt(a.externalEmployeeId, 10), bn = parseInt(b.externalEmployeeId, 10);
      if (!isNaN(an) && !isNaN(bn) && an !== bn) return an - bn;
      return 0;
    });
    canonicalGuids.add(bucket[0].guid);
    if (bucket.length > 1) {
      console.log(`  [dedup] "${bucket[0].firstName} ${bucket[0].lastName}" — Toast has ${bucket.length} records, canonical = #${bucket[0].externalEmployeeId} (guid=${bucket[0].guid}, modified=${bucket[0].modifiedDate}); skipping ${bucket.slice(1).map(b => '#' + b.externalEmployeeId).join(', ')}`);
    }
  }
  console.log(`  ${canonicalGuids.size} canonical Toast records (after name-dedup)\n`);

  // 3. Scan trainers/ collection — un-archive any whose toastGuid is active in Toast
  //    AND has a Toast externalEmployeeId (skips fake/system POS accounts like
  //    "DOOR DASH", "Default Online Ordering", etc. — they're "active" in Toast but
  //    aren't real employees and have no code to log in with).
  //    Dedup by name: if Toast has multiple records for one person, only revive the
  //    one with the newest modifiedDate (matches new sync code's dedup logic).
  console.log('[3] Scanning trainers/ collection for archived docs to revive...');
  const tSnap = await db.collection('trainers').get();
  const trainerHealsRaw = [];
  for (const doc of tSnap.docs) {
    const d = doc.data() || {};
    const isArchived = d.status === 'archived' || d.archived === true;
    if (!isArchived) continue;
    const guid = String(d.toastGuid ?? doc.id);
    const toast = toastByGuid.get(guid);
    if (!toast || toast.deleted) continue;
    if (!toast.externalEmployeeId) continue; // skip fake/system POS accounts
    if (!canonicalGuids.has(toast.guid)) continue; // skip Toast-side duplicate of someone else
    trainerHealsRaw.push({
      docId: doc.id,
      guid,
      name: `${toast.firstName} ${toast.lastName}`.trim() || `${d.firstName || ''} ${d.lastName || ''}`.trim(),
      toastStore: toast.store,
      empNum: toast.externalEmployeeId,
      modifiedDate: toast.modifiedDate || '',
    });
  }
  // Dedup by firstName+lastName: keep newest modifiedDate (tie: lowest empNum)
  const byName = new Map();
  for (const h of trainerHealsRaw) {
    const key = h.name.toLowerCase();
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(h);
  }
  const trainerHeals = [];
  const trainerSkipped = [];
  for (const bucket of byName.values()) {
    bucket.sort((a, b) => {
      if (a.modifiedDate !== b.modifiedDate) return a.modifiedDate < b.modifiedDate ? 1 : -1;
      const an = parseInt(a.empNum, 10), bn = parseInt(b.empNum, 10);
      if (!isNaN(an) && !isNaN(bn) && an !== bn) return an - bn;
      return 0;
    });
    trainerHeals.push(bucket[0]);
    bucket.slice(1).forEach((b) => trainerSkipped.push(b));
  }
  console.log(`  ${trainerHeals.length} trainer doc(s) to revive (after empNum + dedup filter):`);
  trainerHeals.forEach((h) => console.log(`    - ${h.name} #${h.empNum} (docId=${h.docId}, toast store=${h.toastStore})`));
  if (trainerSkipped.length) {
    console.log(`  ${trainerSkipped.length} trainer doc(s) SKIPPED as Toast-side duplicates of someone else:`);
    trainerSkipped.forEach((h) => console.log(`    - ${h.name} #${h.empNum} (docId=${h.docId}) — older record`));
  }

  if (!DRY_RUN) {
    for (const h of trainerHeals) {
      await db.collection('trainers').doc(h.docId).set({
        status: 'active',
        archived: false,
      }, { merge: true });
    }
    console.log(`  WROTE ${trainerHeals.length} trainer un-archive(s).`);
  }

  // 4. Scan staffAccounts — un-archive any entry whose toastGuid OR (empNum + store) matches an active Toast record
  console.log('\n[4] Scanning config/staffAccounts.data for archived entries to revive...');
  const cfgRef = db.collection('config').doc('staffAccounts');
  const cfgSnap = await cfgRef.get();
  if (!cfgSnap.exists) { console.warn('  WARN: staffAccounts doc missing; skipping.'); }
  const accts = (cfgSnap.data() || {}).data || {};
  const acctHealsRaw = [];
  for (const [key, info] of Object.entries(accts)) {
    if (!info || typeof info !== 'object') continue;
    if (!info.archived) continue;
    let toast = null;
    if (info.toastGuid) toast = toastByGuid.get(String(info.toastGuid));
    if (!toast && info.store && toastByEmpNum.has(info.store)) {
      const g = toastByEmpNum.get(info.store).get(String(key).trim());
      if (g) toast = toastByGuid.get(g);
    }
    if (!toast || toast.deleted) continue;
    if (!canonicalGuids.has(toast.guid)) continue; // skip Toast-side duplicate of someone else
    acctHealsRaw.push({
      key,
      name: info.name,
      role: info.role,
      store: info.store,
      toastGuidResolved: toast.guid,
      toastEmpNum: toast.externalEmployeeId,
      modifiedDate: toast.modifiedDate || '',
    });
  }
  // Dedup by name: if multiple archived entries map to the same person, keep one
  const byAcctName = new Map();
  for (const h of acctHealsRaw) {
    const k = String(h.name || h.key).toLowerCase();
    if (!byAcctName.has(k)) byAcctName.set(k, []);
    byAcctName.get(k).push(h);
  }
  const acctHeals = [];
  const acctSkipped = [];
  for (const bucket of byAcctName.values()) {
    bucket.sort((a, b) => {
      if (a.modifiedDate !== b.modifiedDate) return a.modifiedDate < b.modifiedDate ? 1 : -1;
      const an = parseInt(a.toastEmpNum, 10), bn = parseInt(b.toastEmpNum, 10);
      if (!isNaN(an) && !isNaN(bn) && an !== bn) return an - bn;
      return 0;
    });
    acctHeals.push(bucket[0]);
    bucket.slice(1).forEach((b) => acctSkipped.push(b));
  }
  console.log(`  ${acctHeals.length} staffAccounts entry/entries to revive:`);
  acctHeals.forEach((h) => console.log(`    - key=${h.key} role=${h.role} store=${h.store} name=${h.name} (toast empId=${h.toastEmpNum})`));
  if (acctSkipped.length) {
    console.log(`  ${acctSkipped.length} staffAccounts entry/entries SKIPPED as Toast-side duplicates:`);
    acctSkipped.forEach((h) => console.log(`    - key=${h.key} name=${h.name} (toast empId=${h.toastEmpNum}) — older record`));
  }

  if (!DRY_RUN && acctHeals.length) {
    const updates = {};
    for (const h of acctHeals) {
      // Preserve existing fields; flip archived; add toastGuid if missing
      const existing = accts[h.key];
      const newEntry = { ...existing, archived: false };
      if (!existing.toastGuid && h.toastGuidResolved) newEntry.toastGuid = h.toastGuidResolved;
      updates[`data.${h.key}`] = newEntry;
    }
    updates.updatedAt = new Date().toISOString();
    await cfgRef.update(updates);
    console.log(`  WROTE ${acctHeals.length} staffAccounts un-archive(s).`);
  }

  console.log(`\n=== Done (${DRY_RUN ? 'DRY RUN' : 'LIVE'}) ===`);
  console.log(`  trainers/ heals: ${trainerHeals.length}`);
  console.log(`  staffAccounts heals: ${acctHeals.length}`);
  process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
