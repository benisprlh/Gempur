import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyMlArtifacts, sourceFingerprint, ML_ASSET_ROOT } from './verification-core.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');

test('bundled local model has frozen source/protocol/weights/parity/evaluation consistency',()=>{
  const proof=verifyMlArtifacts(root);
  assert.equal(proof.valid,true);
  assert.equal(proof.mode,'advisory-only');
  assert.equal(proof.autoQuarantineEligible,false);
  assert.equal(proof.independentlyReviewedLabelCount,0);
  assert.ok(proof.featureCount>=1000,'A real-source lexical experiment must not be replaced by the tiny unit fixture');
  assert.ok(proof.parityRows>=20&&proof.asciiParityVerified>=10);
});

test('actual experiment keeps training and test support meaningful and discloses source-label scope',()=>{
  const experiment=JSON.parse(readFileSync(resolve(root,'ml/experiment.json'),'utf8'));
  const evaluation=JSON.parse(readFileSync(resolve(root,'ml/evaluation.json'),'utf8'));
  assert.equal(experiment.fitVocabularyOn,'train');
  assert.equal(experiment.selectionScope,'validation');
  assert.equal(experiment.finalTestConsultedForSelection,false);
  assert.equal(evaluation.sourceProxyLabels,true);
  assert.ok(evaluation.dataset.splits.train.n>=1000);
  assert.ok(evaluation.dataset.splits.test.n>=1000);
  assert.ok(evaluation.dataset.splits.test.positive>0&&evaluation.dataset.splits.test.negative>0);
  assert.equal(evaluation.dataset.familyOverlapAcrossSplits,0);
  assert.equal(evaluation.dataset.familyOverlapWithSourceHoldouts,0);
  for(const result of Object.values(evaluation.evaluation.sourceHoldouts)){
    assert.equal(result.negativeSupport,0);
    assert.equal(result.precision,null);
    assert.equal(result.falsePositiveRate,null);
  }
});

test('ML protocol and evaluation are actual fingerprinted inputs alongside private-only model assets',()=>{
  const names=new Set(sourceFingerprint(root).files.map(file=>file.path));
  for(const path of ['ml/experiment.json','ml/sources.lock.json','ml/split_manifest.json','ml/frozen_selection.json','ml/evaluation.json',ML_ASSET_ROOT+'/domain-model.tsv',ML_ASSET_ROOT+'/manifest.json',ML_ASSET_ROOT+'/parity.tsv'])assert.ok(names.has(path),`Missing source input ${path}`);
  assert.equal([...names].some(path=>path.startsWith('out/ml-data/')),false);
});
