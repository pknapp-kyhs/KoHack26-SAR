# Minyan-Man

Minyan-Man is an accessible minyan coordination app built with plain HTML, CSS, and JavaScript.

It uses:

- Firebase Firestore for realtime shared data
- Google Maps Places Autocomplete for location selection
- Google Maps Embed for the details view

## Features

- Create a minyan online
- View upcoming minyanim in realtime
- Confirm, maybe, or decline attendance
- See shared participant counts across multiple users
- Email or text participants from the details view

## Setup

1. Create a Firebase project.
2. Enable Firestore Database.
3. Copy `firebase-config.example.js` to `firebase-config.js`.
4. Fill in your Firebase and Google Maps keys in `firebase-config.js`.
5. Make sure your Google Maps key includes:
   - Places API
   - Maps JavaScript API
   - Maps Embed API

## GitHub

`firebase-config.js` is ignored by git so your real keys do not need to be committed.

Commit the rest:

```bash
git add .
git commit -m "Add Firebase-backed Minyan-Man"
```

## Firebase Shape

- `minyanim/{minyanId}`
- `minyanim/{minyanId}/participants/{clientId}`

## Important

- The included Firestore rules are only a starter.
- Before production, add authentication and tighten permissions.
