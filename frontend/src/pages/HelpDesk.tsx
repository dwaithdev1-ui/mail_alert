import React from 'react';

// Simple Help Desk placeholder component with glassmorphic styling
const HelpDesk: React.FC = () => {
  return (
    <section className="help-panel glass-panel" style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      <h2 style={{ color: 'var(--accent-primary)', marginBottom: '1rem' }}>Help Desk</h2>
      <p style={{ color: 'var(--text-secondary)' }}>
        If you have any questions or need assistance, please contact us at <a href="mailto:support@example.com" style={{ color: 'var(--accent-primary)' }}>support@example.com</a>.
      </p>
      {/* Future: Add a contact form or FAQ here */}
    </section>
  );
};

export default HelpDesk;
