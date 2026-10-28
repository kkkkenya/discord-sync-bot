import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attachmentOf } from '../server/ingest.js';

test('a file is found on a plain message and on a forwarded one', () => {
  const file = { filename: 'a.pdf', url: 'https://cdn/a.pdf' };
  assert.equal(attachmentOf({ attachments: [file] }), file);
  assert.equal(attachmentOf({ attachments: [], message_snapshots: [{ message: { attachments: [file] } }] }), file);
  assert.equal(attachmentOf({ attachments: [] }), null);
});
