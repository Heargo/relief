// @fixture tiny
import { openRelief } from '../helpers/open-relief';
import { expect } from '@wdio/globals';
import { tid } from '../helpers/ui';

it('opens on the tiny fixture chosen by the file annotation', async () => {
  await openRelief();
  await expect(tid('repo-name')).toHaveText('tiny');
});
