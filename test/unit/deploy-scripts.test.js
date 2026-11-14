import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const readDeploy = (name) => fs.readFileSync(new URL(`../../deploy/${name}`, import.meta.url), 'utf8').replace(/^\uFEFF/, '');

test('Windows install uses ID/password bootstrap and restores repository content', () => {
  const script = readDeploy('install.ps1');
  assert.match(script, /--username/);
  assert.match(script, /--password-stdin/);
  assert.match(script, /tools\\import-legacy\.js/);
  assert.match(script, /legacy-content\.json/);
});

test('Windows update backs up the DB and restores the previous release on failure', () => {
  const script = readDeploy('update.ps1');
  assert.match(script, /pre-update-/);
  assert.match(script, /Test-DbIntegrity/);
  assert.match(script, /Invoke-Nssm set \$Script:AppId AppDirectory \$oldDir/);
  assert.match(script, /Set-NssmEnvironment \$oldEnv/);
  assert.match(script, /Start-AppConfirmed -Port \$port -Release \$oldRelease/);
});

test('Windows rollback and restore require explicit confirmation and safety backups', () => {
  const rollback = readDeploy('rollback.ps1');
  const restore = readDeploy('restore.ps1');
  assert.match(rollback, /ValidateSet\('ROLLBACK'\)/);
  assert.match(rollback, /before-rollback-/);
  assert.match(restore, /ValidateSet\('RESTORE'\)/);
  assert.match(restore, /before-restore-/);
  assert.match(restore, /Test-DbIntegrity/);
});
