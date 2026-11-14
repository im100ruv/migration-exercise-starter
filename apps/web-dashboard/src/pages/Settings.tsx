import * as React from 'react';
import { Modal } from '@old/ui';

import { Button as LegacyButton } from "@acme/ds";

type Props = React.ComponentProps<typeof LegacyButton>;

export const SaveButton: React.FC<{ onSave: () => void }> = ({ onSave }) => (
  <LegacyButton intent="brand" onClick={onSave}>Save</LegacyButton>
);

export const PassThrough: React.FC<Props> = (props) => <LegacyButton {...props} />;

export const Cancel: React.FC<{ extra?: Props }> = ({ extra }) => (
  <LegacyButton {...extra} intent="neutral" size="small">Cancel</LegacyButton>
);

export const Confirm: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => (
  <Modal open={open} onClose={onClose}>
    <LegacyButton intent="critical" onClick={onClose}>Close</LegacyButton>
  </Modal>
);
