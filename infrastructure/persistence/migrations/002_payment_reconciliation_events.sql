ALTER TABLE verification_attempt_events
  DROP CONSTRAINT IF EXISTS verification_attempt_events_event_type_check;

ALTER TABLE verification_attempt_events
  ADD CONSTRAINT verification_attempt_events_event_type_check CHECK (
    event_type IN (
      'STARTED',
      'PAYMENT_AUTHORIZED',
      'SUCCEEDED',
      'DUPLICATE',
      'FAILED',
      'PAYMENT_RECONCILED'
    )
  );
