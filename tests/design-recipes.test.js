import test from 'node:test';
import assert from 'node:assert/strict';
import { designRecipes, recipeScaffold } from '../web/design-recipes.js';

// A broken handoff grid can reorder evidence or leave a region in implicit layout
// even when the interactive diagram still looks correct.
test('every scaffold maps each labelled region into both wide and narrow grids', () => {
  for (const recipe of designRecipes) {
    const html = recipeScaffold(recipe.id);
    const expected = recipe.regions.map(region => region.id).sort();
    const grids = [...html.matchAll(/grid-template-areas:\s*([^;]+);/g)];
    assert.equal(grids.length, 2, `${recipe.id} has wide and narrow grids`);
    for (const [, declaration] of grids) {
      const rows = [...declaration.matchAll(/"([^"]+)"/g)].map(match => match[1].split(/\s+/));
      assert.deepEqual([...new Set(rows.flat())].sort(), expected, `${recipe.id} contains every region exactly as a named area`);
      const widths = new Set(rows.map(row => row.length));
      assert.equal(widths.size, 1, `${recipe.id} grid rows have consistent columns`);
    }
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
    assert.equal(ids.length, new Set(ids).size, `${recipe.id} IDs are unique`);
    for (const [, heading] of html.matchAll(/aria-labelledby="([^"]+)"/g)) {
      assert.ok(ids.includes(heading), `${recipe.id} landmark references a present heading`);
    }
  }
});

test('download scaffolds disclose their handoff boundary and contain no unwired controls', () => {
  for (const recipe of designRecipes) {
    const html = recipeScaffold(recipe.id);
    assert.ok(html.startsWith('<!doctype html>'));
    assert.ok(html.endsWith('</html>\n'));
    assert.match(html, /does not load research or implement product controls/);
    assert.match(html, /href="\.\/design-tokens\.css"/);
    assert.match(html, /href="\.\/atlas-ui\.css"/);
    assert.doesNotMatch(html, /<(?:button|input|select|script|form)\b/i);
    assert.ok(html.includes('Still to build:'));
    assert.equal(recipeScaffold(recipe.id), html, 'scaffold export is deterministic');
  }
  assert.throws(() => recipeScaffold('unknown'), /Unknown Atlas recipe/);
});

test('profile and graph scaffold evidence follows the main content in narrow DOM reading order', () => {
  for (const key of ['graph', 'startup', 'partner']) {
    const recipe = designRecipes.find(item => item.id === key);
    const html = recipeScaffold(key);
    const aside = html.indexOf('<aside');
    assert.ok(aside > 0);
    for (const region of recipe.regions.filter(item => item.element === 'section')) {
      assert.ok(html.indexOf(`class="recipe-${region.id}"`) < aside, `${key}: ${region.id} precedes the evidence aside`);
    }
  }
});

// Downloads opened through file: must still navigate to the published product.
test('all five downloaded scaffolds link to their published Atlas explorer', () => {
  assert.equal(designRecipes.length, 5);
  for (const recipe of designRecipes) {
    const html = recipeScaffold(recipe.id);
    const [, escapedHref] = html.match(/href="([^"]+)">Open the working Atlas view<\/a>/) || [];
    assert.ok(escapedHref, `${recipe.id} has the working-view link`);
    const href = escapedHref.replaceAll('&amp;', '&');
    const link = new URL(href, 'file:///downloaded-design-kit/scaffold.html');
    assert.equal(link.origin, 'https://castlemilk.github.io');
    assert.equal(link.href, new URL(recipe.route, 'https://castlemilk.github.io/startup-atlas/').href);
  }
});
