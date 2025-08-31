import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const app = express();
const port = 3000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const nevnapok = JSON.parse(fs.readFileSync('./nevnapok.json', 'utf-8'));

const allNames = new Set();
Object.values(nevnapok).forEach((days) =>
  Object.values(days).forEach((lists) => {
    lists.main?.forEach((n) => n && allNames.add(n));
    lists.other?.forEach((n) => n && allNames.add(n));
  }),
);
const sortedNames = [...allNames].sort((a, b) => a.localeCompare(b, 'hu'));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'views/index.html')));

app.get('/names', (req, res) => {
  const q = (req.query.q || '').toLowerCase();
  const results = q ? sortedNames.filter((n) => n.toLowerCase().startsWith(q)) : sortedNames;
  res.json(results.slice(0, 50));
});

function getEvents(names, mainOnly = false) {
  const events = [];
  Object.entries(nevnapok).forEach(([month, days]) =>
    Object.entries(days).forEach(([day, lists]) => {
      const dayNames = mainOnly ? lists.main : [...lists.main, ...lists.other];
      names.forEach((name) => {
        if (dayNames.includes(name)) {
          events.push({ name, month: month.padStart(2, '0'), day: day.padStart(2, '0') });
        }
      });
    }),
  );
  return events;
}

function generateICS(events, reminderMinutes = [1440]) {
  const currentYear = new Date().getFullYear();

  const header = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Nevnapok Calendar//EN',
    'CALSCALE:GREGORIAN',
  ].join('\n');

  const vevents = events
    .map(({ name, month, day }) => {
      const dtstart = `${currentYear}${month}${day}`;
      const vevent = [
        'BEGIN:VEVENT',
        `UID:${name}-${month}${day}@nevnapok.example.com`,
        `DTSTAMP:${dtstart}T000000Z`,
        `DTSTART;VALUE=DATE:${dtstart}`,
        'RRULE:FREQ=YEARLY',
        `SUMMARY:Névnap: ${name}`,
      ];
      
      reminderMinutes.forEach(minutes => {
        if (minutes > 0) {
          vevent.push('BEGIN:VALARM');
          vevent.push('ACTION:DISPLAY');
          vevent.push(`DESCRIPTION:Névnap: ${name}`);
          vevent.push(`TRIGGER:-PT${minutes}M`);
          vevent.push('END:VALARM');
        }
      });
      
      vevent.push('END:VEVENT');
      return vevent.join('\n');
    })
    .join('\n');

  return `${header}\n${vevents}\nEND:VCALENDAR`;
}

app.get('/calendar.ics', (req, res) => {
  const namesQuery = req.query.subscribednames || '';
  const subscribedNames = namesQuery
    .split(',')
    .map((n) => n.trim())
    .filter(Boolean);

  const mainOnly = req.query.mainonly === 'true';
  const reminderMinutes = req.query.reminders ? 
    req.query.reminders.split(',').map(r => parseInt(r)).filter(r => r > 0) : 
    [1440];
  const events = getEvents(subscribedNames, mainOnly);
  const icsContent = generateICS(events, reminderMinutes);

  res.setHeader('Content-Type', 'text/calendar');
  res.setHeader('Content-Disposition', 'attachment; filename="nevnapok.ics"');
  res.send(icsContent);
});

app.listen(port, () => {
  console.log(`Nevnapok calendar server running at http://localhost:${port}`);
});
