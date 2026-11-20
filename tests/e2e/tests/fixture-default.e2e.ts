import { openRelief } from '../helpers/open-relief';
import { expect } from '@wdio/globals';
import { tid } from '../helpers/ui';

it('stays on acme-shop when the spec asks for no fixture', async () => {
  await openRelief();
  await expect(tid('repo-name')).toHaveText('acme-shop');
});
