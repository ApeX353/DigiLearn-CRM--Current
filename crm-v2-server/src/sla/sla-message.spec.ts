import { slaAlertText } from './sla-message';

describe('slaAlertText', () => {
  const vars = { lead: 'Kids Joy', status: 'Contacted', hours: 24, duration: '3h' };

  it('uses the default wording when no message is configured', () => {
    expect(slaAlertText(null, vars, 'default')).toBe('default');
    expect(slaAlertText('   ', vars, 'default')).toBe('default');
  });

  it('fills the placeholders', () => {
    expect(
      slaAlertText('{lead} is {duration} past its {hours}h SLA in {status}', vars, 'x'),
    ).toBe('Kids Joy is 3h past its 24h SLA in Contacted');
  });

  it('appends the lead when the message never names it', () => {
    expect(slaAlertText('Call the school today.', vars, 'x')).toBe(
      'Call the school today. — Lead "Kids Joy"',
    );
  });
});
