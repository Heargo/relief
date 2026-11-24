// @fixture unanalysed
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { $$, browser, expect } from '@wdio/globals';
import { openRelief } from '../helpers/open-relief';
import { press, tid, typeText } from '../helpers/ui';

// The app is opened without a range: HEAD against the working tree. `Total.java` and the Angular
// template are read by no language adapter. A changed expression in the template is a text change:
// the file is not "format only" and its text diff shows without a click. `Total.java` only changes
// its indentation: it is "format only", hidden until "show anyway".
const repo = () => process.env['RELIEF_E2E_REPO'] ?? '';
const JAVA = 'src/main/java/shop/Total.java';
const HTML = 'src/app/orders.component.html';
const JAVA_BASE = 'class Total {\n    int sum(int a, int b) {\n        return a + b;\n    }\n}\n';
const HTML_BASE = '<ul>\n  <li>{{ order.id }}</li>\n</ul>\n';

const line = (kind: string, text: string) =>
  `//*[@data-testid="diff-panel"]//*[@data-testid="diff-line"][@data-kind="${kind}"][contains(., "${text}")]`;

async function select(name: string, pathEnd: string): Promise<void> {
  await press('/');
  await typeText(name);
  await expect(tid('search-results')).toBeDisplayed();
  await press('Enter');
  await expect(tid('selected-node')).toHaveAttribute(
    'data-node-id',
    expect.stringMatching(new RegExp(`file:${pathEnd.replace(/\./g, '\\.')}$`)),
  );
}

describe('a changed file no adapter reads', () => {
  after(() => {
    writeFileSync(join(repo(), JAVA), JAVA_BASE);
    writeFileSync(join(repo(), HTML), HTML_BASE);
  });

  it('shows its text diff at once when the text changes, and behind a click when only the indentation does', async () => {
    writeFileSync(join(repo(), HTML), '<ul>\n  <li>{{ order.total }}</li>\n</ul>\n');
    writeFileSync(
      join(repo(), JAVA),
      'class Total {\n\tint sum(int a, int b) {\n\t\treturn a + b;\n\t}\n}\n',
    );
    await openRelief({ size: { width: 1600, height: 1000 } });
    await tid('menu-trigger-settings').click();
    await tid('menu-item-reload').click();

    await select('orders.component.html', HTML);
    await expect($$('[data-testid="diff-format-only"]')).toBeElementsArrayOfSize(0);
    await expect($$(line('removed', 'order.id'))).toBeElementsArrayOfSize(1);
    await expect($$(line('added', 'order.total'))).toBeElementsArrayOfSize(1);

    await select('Total.java', JAVA);
    await expect(tid('diff-format-only')).toBeDisplayed();
    await tid('diff-show-anyway').click();
    await browser.waitUntil(async () => (await $$(line('added', 'return a + b'))).length === 1, {
      timeout: 10000,
      timeoutMsg: 'the text diff of Total.java never appeared',
    });
    await expect($$(line('removed', 'return a + b'))).toBeElementsArrayOfSize(1);
  });
});
