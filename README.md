# Water Reminder

A small PWA that tracks daily water intake and sends browser notifications until you hit your 3L (configurable) goal.

## Features

- Progress ring showing intake vs. daily goal
- Quick-add buttons (+250ml / +500ml / +1L) and custom amounts
- Configurable daily goal, reminder interval, and active hours (e.g. only remind 8am–10pm)
- Browser notifications with quick +250ml / +500ml actions right from the notification
- Installable as a PWA (works offline, can run as its own window)
- All data stored locally (`localStorage`) — no backend, no account

## Running

```bash
npm install
npm run dev
```

Open the app, click **Enable Notifications**, and optionally install it as an app (browser install icon / "Add to Home Screen") so it can run in the background more reliably.

## How reminders work

Reminders are scheduled both from the open page and from the service worker, at whatever interval you set, but only fire within your configured active window and only while you're below your daily goal. For most reliable delivery, keep the installed app or a pinned tab open — this is a frontend-only app with no server-side push, so it can't notify you if the browser isn't running at all.

## Build

```bash
npm run build
npm run preview
```

🌐 **Live Demo:** [water-reminder-pi.vercel.app](https://water-reminder-pi.vercel.app/)
