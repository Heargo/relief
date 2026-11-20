import { $, expect } from '@wdio/globals';
import { openRelief } from '../helpers/open-relief';
import { press, tid, typeText } from '../helpers/ui';

// Contract with the UI (data attributes, no i18n dependency):
//  - the impact section of the panel is `data-testid="impact-section"`, its count `impact-count`;
//  - the "via HTTP" box is `impact-http-toggle` (checked by default), rows are `impact-row`.
it('the impact of SessionStore.refresh is 8 callers, 6 without HTTP', async () => {
  await openRelief();
  await press('/');
  await typeText('SessionStore.refresh');
  await expect(tid('search-results')).toBeDisplayed();
  await press('Enter');
  await expect(tid('selected-node')).toHaveAttribute(
    'data-node-id',
    expect.stringMatching(/sym:SessionStore\.refresh$/),
  );

  await expect(tid('impact-count')).toHaveText(expect.stringContaining('8 transitive callers'));
  await $('[data-testid="impact-http-toggle"]').click();
  await expect(tid('impact-count')).toHaveText(expect.stringContaining('6 transitive callers'));
});
