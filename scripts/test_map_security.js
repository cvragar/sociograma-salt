#!/usr/bin/env node
'use strict';

// Regression for csf_565e890c79fc70cb02632494. Both shipped entry points must
// render fixed legal credits without touching any remote style/TileJSON HTML.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const sources = ['app.js', 'sociograma-revisado.html'];
const payloads = [
  '<img src=x onerror="localStorage.getItem(\'salt-sociograma-pla-v2\')">',
  '<script>localStorage.getItem("salt-sociograma-pla-v2")</script>',
  '<a href="javascript:alert(document.domain)">credit</a>',
  '<svg/onload=alert(1)>',
  '<img src=x onerror=&#97;&#108;&#101;&#114;&#116;(1)>',
  '</div><iframe srcdoc="<script>alert(1)</script>"></iframe>'
];
const safeLinks = new Map([
  ['OpenStreetMap', 'https://www.openstreetmap.org/copyright'],
  ['OpenMapTiles', 'https://openmaptiles.org/'],
  ['OpenFreeMap', 'https://openfreemap.org/'],
  ['INE', 'https://www.ine.es/'],
  ['Idescat', 'https://www.idescat.cat/'],
  ['ICGC', 'https://www.icgc.cat/'],
  ['CC BY 4.0', 'https://creativecommons.org/licenses/by/4.0/']
]);

function fakeDocument() {
  const elements = [];
  return {
    elements,
    createTextNode(text) { return {nodeType: 3, textContent: text}; },
    createElement(tagName) {
      const el = {
        tagName, children: [], attributes: {}, style: {}, removed: false,
        setAttribute(name, value) { this.attributes[name] = value; },
        appendChild(child) { this.children.push(child); return child; },
        remove() { this.removed = true; }
      };
      Object.defineProperty(el, 'innerHTML', {
        set() { throw new Error('Attribution must never use an HTML sink'); }
      });
      elements.push(el);
      return el;
    }
  };
}

let canonical;
let checks = 0;
for (const filename of sources) {
  const source = fs.readFileSync(path.join(root, filename), 'utf8');
  const match = source.match(/\/\* BEGIN FIXED MAP ATTRIBUTION[\s\S]*?\/\* END FIXED MAP ATTRIBUTION \*\//);
  assert.ok(match, `${filename}: fixed attribution implementation is present`);
  if (canonical) assert.equal(match[0], canonical, 'Both entry points use the same reviewed control');
  canonical = match[0];
  assert.doesNotMatch(source, /new\s+maplibregl\.AttributionControl\s*\(/,
    `${filename}: dynamic attribution must not be reinstated`);
  const mapConstructors = [...source.matchAll(/new\s+maplibregl\.Map\(\{([\s\S]*?)\}\);/g)];
  assert.equal(mapConstructors.length, 1, `${filename}: check each browser map constructor`);
  assert.match(mapConstructors[0][1], /attributionControl\s*:\s*false/,
    `${filename}: disable the implicit dynamic attribution control`);
  assert.match(source, /\.addControl\(atribucioFixa\(\)\)/,
    `${filename}: the fixed control must actually be attached to the map`);

  for (const payload of payloads) {
    for (const origin of ['style', 'tilejson']) {
      const document = fakeDocument();
      let reads = 0;
      const context = vm.createContext({document, localStorage: {
        getItem() { reads++; throw new Error('Remote attribution read planner storage'); }
      }});
      const control = vm.runInContext(`${match[0]}\natribucioFixa()`, context);
      const sourceMetadata = {attribution: payload};
      // A remote style can contain attribution directly or fetch it later
      // through TileJSON. Neither is a source of data for this control.
      const map = {
        getStyle() { return {sources: {openmaptiles: origin === 'style' ? sourceMetadata : {url:'https://provider.example/tiles.json'}}}; },
        getSource() { return sourceMetadata; },
        style: {sourceCaches: {openmaptiles: {_source: sourceMetadata}}},
        on() { throw new Error('Fixed attribution must not subscribe to remote source metadata'); }
      };
      assert.equal(control.getDefaultPosition(), 'bottom-right');
      const container = control.onAdd(map);
      assert.match(container.className, /maplibregl-ctrl-attrib/);
      assert.equal(container.attributes['aria-label'], 'Fonts cartogràfiques');
      const anchors = document.elements.filter(el => el.tagName === 'a');
      assert.equal(anchors.length, safeLinks.size);
      for (const anchor of anchors) {
        assert.equal(anchor.href, safeLinks.get(anchor.textContent));
        assert.equal(anchor.target, '_blank');
        assert.equal(anchor.rel, 'noopener noreferrer');
      }
      assert.ok(document.elements.every(el => ['div','a'].includes(el.tagName)));
      assert.ok(!JSON.stringify(document.elements).includes(payload));
      assert.equal(reads, 0);
      control.onRemove();
      assert.equal(container.removed, true);
      checks++;
    }
  }
}
console.log(`Fixed map attribution: ${checks} hostile style/TileJSON cases passed across both entry points.`);
