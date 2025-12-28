import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html = readFileSync('public/event-log.html', 'utf8');
const css = readFileSync('public/css/input.css', 'utf8');

assert.match(
  html,
  /class="logs-table-frame"/,
  'Expected logs table to be wrapped in a .logs-table-frame container.'
);

assert.match(
  css,
  /\.logs-table-frame\s*{[^}]*border-radius:\s*12px[^}]*overflow:\s*hidden[^}]*}/s,
  'Expected .logs-table-frame to enforce rounded corners with overflow clipping.'
);
