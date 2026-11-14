import * as React from 'react';
import { Card } from '@old/ui';
import { Button as LegacyButton, ButtonProps } from "@acme/ds";

interface Props {
  destructive: boolean;
  tone?: ButtonProps["intent"];
}

export const Example: React.FC<Props> = ({ destructive, tone }) => (
  <Card title="Example">
    {/* Keep this Button variant="danger" example as documentation. */}
    <LegacyButton intent="brand" size="small" fullWidth>
      Primary
    </LegacyButton>
    <LegacyButton
      intent={destructive ? "critical" : "brand"}
      size={"medium"}
      fullWidth={false}
    >
      Confirm
    </LegacyButton>
    <LegacyButton intent={tone}>Tone</LegacyButton>
  </Card>
);