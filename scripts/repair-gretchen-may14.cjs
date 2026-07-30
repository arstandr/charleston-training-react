#!/usr/bin/env node
// Repair: un-archive Gretchen Stewart's legacy trainer doc + create her staffAccounts entry.
// Matches the exact shape syncTrainersFromToast() would write.
// Run with --dry-run first to see what will change.

const admin = require('firebase-admin');
const SERVICE_ACCOUNT = require('/Users/adamstandridge/Documents/projects/service-account.json');

const DRY_RUN = process.argv.includes('--dry-run');
const TRAINER_DOC_ID = 'mmCMESENwSgKwO3i0g9C';
const TOAST_GUID = 'a15c8087-1daa-44c4-98a4-012806a7161b';
const EMP_NUM = '4015';
const FIRST = 'Gretchen';
const LAST = 'Stewart';
const EMAIL = 'stewart.gretchen@yahoo.com';
const JOB_TITLE = 'Server Trainer';
const STORE = 'Westfield';
const WESTFIELD_GUID = '86326c13-2905-455f-924a-a970ba974785';

admin.initializeApp({ credential: admin.credential.cert(SERVICE_ACCOUNT) });
const db = admin.firestore();

(async () => {
  console.log(`=== Gretchen repair (${DRY_RUN ? 'DRY RUN' : 'LIVE'}) ===\n`);

  // 1. Trainer doc
  console.log(`[1] trainers/${TRAINER_DOC_ID}`);
  const trainerRef = db.collection('trainers').doc(TRAINER_DOC_ID);
  const trainerSnap = await trainerRef.get();
  if (!trainerSnap.exists) {
    console.error('  FAIL — doc does not exist; aborting.');
    process.exit(1);
  }
  const before = trainerSnap.data();
  console.log('  BEFORE:', {
    status: before.status,
    archived: before.archived,
    toastGuid: before.toastGuid,
    firstName: before.firstName,
    lastName: before.lastName,
    locationGuid: before.locationGuid,
  });
  const trainerUpdate = {
    status: 'active',
    archived: false,
    firstName: FIRST,
    lastName: LAST,
    email: EMAIL,
    jobTitle: JOB_TITLE,
    toastGuid: TOAST_GUID,
    locationGuid: WESTFIELD_GUID,
    rating: before.rating ?? 0,
    totalRatings: before.totalRatings ?? 0,
  };
  console.log('  WILL WRITE (merge):', trainerUpdate);
  if (!DRY_RUN) {
    await trainerRef.set(trainerUpdate, { merge: true });
    console.log('  WROTE.');
  }

  // 2. staffAccounts — live shape is { data: { [empNum]: {...} }, updatedAt }
  console.log('\n[2] staffAccounts');
  const cfgRef = db.collection('config').doc('staffAccounts');
  const cfgSnap = await cfgRef.get();
  if (!cfgSnap.exists) {
    console.error('  FAIL — config/staffAccounts does not exist; aborting.');
    process.exit(1);
  }
  const cfgData = cfgSnap.data() || {};
  const accts = (cfgData.data && typeof cfgData.data === 'object') ? cfgData.data : null;
  if (!accts) {
    console.error('  FAIL — config/staffAccounts.data is not an object; aborting.');
    process.exit(1);
  }

  // Sticky-key guard: if any active entry already has her toastGuid, update that key in place
  let targetKey = EMP_NUM;
  for (const [k, v] of Object.entries(accts)) {
    if (!v || typeof v !== 'object') continue;
    if (v.toastGuid && String(v.toastGuid) === TOAST_GUID && !v.archived) {
      targetKey = k;
      break;
    }
  }
  const existing = accts[targetKey];
  console.log(`  target key: data.${targetKey}`);
  console.log('  BEFORE:', existing ?? '(none)');

  if (existing && (existing.role === 'admin' || existing.role === 'owner')) {
    console.error(`  FAIL — key ${targetKey} is admin/owner; refusing to demote. Aborting.`);
    process.exit(1);
  }
  const newEntry = {
    ...(existing || {}),
    role: 'trainer',
    name: `${FIRST} ${LAST}`,
    store: STORE,
    archived: false,
    toastGuid: TOAST_GUID,
  };
  console.log('  WILL WRITE to data.' + targetKey + ':', newEntry);

  if (!DRY_RUN) {
    await cfgRef.update({
      [`data.${targetKey}`]: newEntry,
      updatedAt: new Date().toISOString(),
    });
    console.log('  WROTE.');
  }

  // 3. Verify
  if (!DRY_RUN) {
    console.log('\n[3] Verifying...');
    const v1 = (await trainerRef.get()).data();
    console.log('  trainers/ AFTER:', { status: v1.status, archived: v1.archived, firstName: v1.firstName, lastName: v1.lastName });
    const v2cfg = (await cfgRef.get()).data() || {};
    const v2accts = (v2cfg.data && typeof v2cfg.data === 'object') ? v2cfg.data : {};
    console.log(`  staffAccounts.data.${targetKey} AFTER:`, v2accts[targetKey]);
  }

  console.log(`\n=== Done (${DRY_RUN ? 'DRY RUN — no writes' : 'LIVE writes complete'}) ===`);
  process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
