// A book's section headings (server/sections.js): the contents and index are skipped, so a topic opens at its section.
import test from 'node:test';
import assert from 'node:assert/strict';

const { isListing, headingsOf, sectionsOf, pageFor, sectionsAbout } = await import('../server/sections.js');
const { learnPath } = await import('../server/learn.js');

const contents = 'CONTENTS Preface xv 1. STRESSES AND STRAINS 1.1 Introduction to Strength of Materials 1 1.1.1 Types of Loads 2 1.2 Concept of Stress 5 1.2.1 Direct or Normal Stress 5 1.2.2 Shear or Tangential Stress 10 1.3 Stress Distribution under Axial Loading 16';
const page21 = 'Chapter 1 Stresses and Strains 5 Brittle materials fracture early. 1.2 CONCEPT OF STRESS Let us assume two bars of different materials. See Figure 1.6 F.B.D. of joint B.';
const page26 = '10 Fundamentals of Strength of Materials Required steel area = 400 mm 2 Ans. 1.2.2 Shear or Tangential Stress (Simple or Direct Shear) A shear stress results when a member is loaded parallel to a surface. The value 0.29 Because of this';

test('contents pages are listings; body pages give their headings, not figures or stray decimals', () => {
  assert.equal(isListing(contents), true);
  assert.equal(isListing(page21), false);
  assert.deepEqual(headingsOf(contents, 6), []);
  assert.deepEqual(headingsOf(page21, 21), [[21, '1.2', 'CONCEPT OF STRESS']]);
  assert.deepEqual(headingsOf(page26, 26), [[26, '1.2.2', 'Shear or Tangential Stress (Simple or Direct Shear)']]);
});

test('a guide\'s place or a topic name opens at the section\'s real page', () => {
  const sections = sectionsOf(Array.from({ length: 30 }, (_, i) => (i === 5 ? contents : i === 20 ? page21 : i === 25 ? page26 : 'plain text')));
  assert.equal(pageFor(sections, 'Ch. 1, §1.2.2, pp. 10-15', ''), 26);
  assert.equal(pageFor(sections, '', 'Shearing stress'), 26);
  assert.equal(pageFor(sections, '', 'Torsion of shafts'), null);
  assert.equal(sectionsAbout(sections, new Set(['shear']), new Set(['shear']))[0].from, 26);
});

test('Learn a topic skips the contents page and adds the book\'s section on it', () => {
  const text = `${contents} ${page21}`;
  const book = { id: 'b1', name: 'Chandramouli.pdf', text, pageStarts: [0, contents.length + 1], sections: [[21, '1.2', 'CONCEPT OF STRESS'], [26, '1.2.2', 'Shear or Tangential Stress'], [32, '1.3', 'Stress Distribution']] };
  const p = learnPath({ topic: { id: 't', name: 'Shear stress' }, files: [book] });
  assert.ok(p.read.every((r) => r.pages?.[0] !== 1), 'not the contents page');
  assert.ok(p.read.some((r) => r.pages?.[0] === 26), 'the section on it');
});
