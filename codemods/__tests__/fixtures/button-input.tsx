import * as React from 'react';
import { Button as LegacyButton, Card } from '@old/ui';
import { ButtonProps } from '@old/ui';

interface Props {
  destructive: boolean;
  tone?: ButtonProps['variant'];
}

export const Example: React.FC<Props> = ({ destructive, tone }) => (
  <Card title="Example">
    {/* Keep this Button variant="danger" example as documentation. */}
    <LegacyButton variant="primary" size='sm' block>
      Primary
    </LegacyButton>
    <LegacyButton
      variant={destructive ? 'danger' : 'primary'}
      size={'md'}
      block={false}
    >
      Confirm
    </LegacyButton>
    <LegacyButton variant={tone}>Tone</LegacyButton>
  </Card>
);