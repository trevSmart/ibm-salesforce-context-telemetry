import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

test('event log table wrapper does not shift left outside scroll container', async () => {
	const source = await readFile(new URL('../public/js/event-log.js', import.meta.url), 'utf8');
	assert.ok(
		!source.includes('class="-mx-4 -my-2 sm:-mx-6 lg:-mx-8"'),
		'Table wrapper still applies negative horizontal margins'
	);
});
