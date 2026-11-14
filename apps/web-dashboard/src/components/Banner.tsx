import * as React from 'react';
import * as UI from '@old/ui';

import { Button as AcmeButton } from "@acme/ds";

export const Banner: React.FC<{ message: string }> = ({ message }) => (
  <UI.Card title={message}>
    <AcmeButton intent="critical" size="small">Dismiss</AcmeButton>
  </UI.Card>
);
