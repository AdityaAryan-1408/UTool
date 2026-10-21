const GREETINGS = [
  { before: 3, emoji: '🌌', text: 'Burning the midnight oil?' },
  { before: 5, emoji: '🌙', text: "The world's still waking up" },
  { before: 7, emoji: '🌄', text: 'Good morning' },
  { before: 9, emoji: '🌤️', text: 'A bright new morning' },
  { before: 12, emoji: '☀️', text: 'Ready to make today count?' },
  { before: 13, emoji: '🌞', text: 'Good afternoon' },
  { before: 15, emoji: '🌥️', text: "Hope your day's going well" },
  { before: 17, emoji: '🌇', text: 'Take a little breather' },
  { before: 19, emoji: '🌆', text: 'Good evening' },
  { before: 22, emoji: '🌃', text: 'The evening is yours' },
  { before: 24, emoji: '🌙', text: 'Time to wind down' },
];

export function getNotchGreeting(name = 'Aditya', date = new Date()) {
  const hour = date.getHours();
  const greeting = GREETINGS.find((item) => hour < item.before) || GREETINGS[0];
  const safeName = name.trim() || 'Aditya';
  const text = greeting.text.endsWith('?')
    ? `${greeting.text.slice(0, -1)}, ${safeName}?`
    : `${greeting.text}, ${safeName}`;

  return { emoji: greeting.emoji, text, phrase: greeting.text };
}
