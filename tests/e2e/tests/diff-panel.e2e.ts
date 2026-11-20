import { $, $$, expect } from '@wdio/globals';
import { openRelief } from '../helpers/open-relief';
import { press, tid, typeText } from '../helpers/ui';

// Contract with the UI (data attributes, no i18n dependency), on main...feat/promo-codes:
//  - the structural diff of the selected node is `data-testid="diff-panel"`, inside the
//    selected node panel; each line is a `diff-line` with `data-kind` (added | removed | context);
//  - the signature block is `diff-signature`, its badge `signature-badge` with
//    `data-breaking` (true | false).
const line = (kind: string, text: string) =>
  `//*[@data-testid="diff-panel"]//*[@data-testid="diff-line"][@data-kind="${kind}"][contains(., "${text}")]`;

it('selecting SessionStore.refresh shows the widened return type as an added line and the breaking badge', async () => {
  await openRelief();
  await press('/');
  await typeText('SessionStore.refresh');
  await expect(tid('search-results')).toBeDisplayed();
  await press('Enter');
  await expect(tid('selected-node')).toHaveAttribute(
    'data-node-id',
    expect.stringMatching(/sym:SessionStore\.refresh$/),
  );

  await expect($$(line('added', 'Promise<Session | null>'))).toBeElementsArrayOfSize(1);
  await expect($$(line('removed', 'Promise<Session>'))).toBeElementsArrayOfSize(1);
  // Lines are numbered as in the file: `refresh` starts at line 15 of session.ts on both sides.
  await expect(
    $(
      '[data-testid="diff-panel"] [data-testid="diff-line"][data-kind="added"][data-new-line="15"]',
    ),
  ).toHaveText(expect.stringContaining('Promise<Session | null>'));
  await expect(
    $(
      '[data-testid="diff-panel"] [data-testid="diff-line"][data-kind="removed"][data-old-line="15"]',
    ),
  ).toHaveText(expect.stringContaining('Promise<Session>'));
  await expect($('[data-testid="diff-panel"] [data-testid="signature-badge"]')).toHaveAttribute(
    'data-breaking',
    'true',
  );
});
