import './setup';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_STYLE, type ReportStyle } from '../src/utils/reports/pdf/types';
import { styleFor } from '../src/utils/reports/pdf/model';

const read = (p: string) => readFileSync(p, 'utf8');

/** The design contract from the approved reference: these values must not drift silently. */
test('report design tokens match the approved reference', () => {
  const css = read('src/utils/reports/pdf/masterHtml.ts');
  assert.ok(css.includes('--ok-bg:#F0FDF4') && css.includes('--ok-bd:#BBF7D0'), 'correct tint');
  assert.ok(css.includes('--no-bg:#FEF2F2') && css.includes('--no-bd:#FECACA'), 'wrong tint');
  assert.ok(css.includes('--sk-bg:#FFFBEB') && css.includes('--sk-bd:#FDE68A'), 'skipped tint');
  assert.ok(css.includes('--ex-bg:#F5F3FF'), 'explanation tint');
  assert.ok(css.includes('--radius:12px') && css.includes('--pad:16px'), 'radii and padding');
  assert.ok(css.includes('max-width:1000px'), 'content column');
  assert.ok(/box-shadow:0 2px 8px rgba\(0,0,0,\.04\)/.test(css), 'elevation');
  assert.ok(/grid-template-columns:1fr 1fr;gap:16px/.test(css), 'two-column grid');
  assert.ok(/font-weight:(400|700|800)/.test(css), 'Inter weights 400–800');
  assert.ok(!/fonts\.googleapis/.test(css), 'no remote fonts');
});

test('the master template is the default, and exam papers keep the classic one', () => {
  assert.equal(DEFAULT_STYLE.template, 'master');
  assert.equal(styleFor('all').template, 'master');
  assert.equal(styleFor('wrong').template, 'master');
  assert.equal(styleFor('exam').template, 'classic');
  const forced: ReportStyle = styleFor('exam', { template: 'master' });
  assert.equal(forced.template, 'master', 'an explicit choice wins');
});

test('both renderers understand every op the template emits', () => {
  const svg = read('src/components/reports/PdfPages.tsx');
  assert.ok(/op\.t === 'circle'/.test(svg), 'SVG preview draws circles');
  assert.ok(/fillOpacity/.test(svg), 'opacity is honoured in the preview');
  const pdf = read('src/utils/reports/pdf/pdfWriter.ts');
  assert.ok(/drawCircle/.test(pdf), 'PDF draws circles');
  assert.ok(/opacity/.test(pdf), 'opacity reaches the PDF');
  const types = read('src/utils/reports/pdf/types.ts');
  for (const op of ["'text'", "'line'", "'rect'", "'circle'"]) assert.ok(types.includes(`t: ${op}`), `op ${op}`);
});
