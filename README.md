# Minyan-Man

Minyan-Man is a shared local-network minyan coordination app built with plain HTML, CSS, and JavaScript.

It uses:

- Node.js + Express for the local server
- SQLite for shared data on one computer
- Google Maps Places Autocomplete for location selection
- Google Maps Embed for the details view

## How It Works

One computer runs the server and database.

Other devices on the same Wi-Fi network open the app in a browser using that computer's local IP address.

## Files

- `index.html` - app structure
- `style.css` - styling
- `script.js` - frontend logic
- `server.js` - local backend API
- `package.json` - local server dependencies
- `local-config.example.js` - config template

## Setup

1. Install Node.js.
2. In this project folder, run:

```bash
npm install
```

3. Copy `local-config.example.js` to `local-config.js`.
4. Add your Google Maps API key to `local-config.js`.
5. Start the server:

```bash
npm start
```

6. On the main computer, open:

```text
http://localhost:3000
```

7. Find your computer's local IP address and open that from other devices on the same network:

```text
http://YOUR-IP-ADDRESS:3000
```

Example:

```text
http://192.168.1.25:3000
```

## GitHub

Commit these files:

- `index.html`
- `style.css`
- `script.js`
- `server.js`
- `package.json`
- `README.md`
- `local-config.example.js`
- `.gitignore`

Do not commit:

- `local-config.js`
- `data/minyan-man.db`
- `node_modules`

## Notes

- The server must stay running for other devices to connect.
- All devices should be on the same local network.
- Windows Firewall may ask you to allow Node.js network access.
