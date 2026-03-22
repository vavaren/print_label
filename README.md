# Print Label

This app now supports two printer modes from the same web UI:

- Room A: two USB DYMO 450 printers
- Room B: DYMO 550 over network

It also includes two UI pages:

- Classic page: `/index.html` (existing flow)
- Structured page: `/structured.html` (same table/search/preview layout as classic, but structured fields: name, artnum, num_meters, width)

## Start

1. Install dependencies:
    - `npm install`
2. Start server:
    - `npm run start`
3. Open:
    - `http://<server-ip>:63425/index.html`

## Room Configuration

Edit `secrets/network.json`.

Example schema:

```
{
	"ip-adress": "192.168.88.181",
	"activeRoom": "roomA",
	"roomA": {
		"label": "Room A (USB 450)",
		"protocol": "dymo-http",
		"endpoint": "https://127.0.0.1:41951",
		"timeoutMs": 3000,
		"retries": 1,
		"printers": {
			"liten": { "name": "DYMO Etikett 1", "templatePrefix": "legacy" },
			"stor": { "name": "DYMO Etikett 2", "templatePrefix": "legacy" }
		}
	},
	"roomB": {
		"label": "Room B (Network 550)",
		"protocol": "auto",
		"endpoint": "https://192.168.88.181:41951",
		"timeoutMs": 3000,
		"retries": 2,
		"printerName": "DYMO 550 5XL",
		"printers": {
			"liten": { "name": "DYMO 550 5XL", "templatePrefix": "legacy" },
			"stor": { "name": "DYMO 550 5XL", "templatePrefix": "legacy" }
		}
	}
}
```

Notes:

- Keep `ip-adress` for backward compatibility.
- For roomB protocol, use `auto` to probe `dymo-http` then `raw` at startup.
- If your printer uses a different network protocol/path, set roomB explicitly.

## API Endpoints

- `GET /print` classic print
- `GET /preview` classic preview
- `POST /print-structured` structured print
- `POST /preview-structured` structured preview
- `GET /config/rooms` room config + probe status
- `POST /config/room` set active room
- `GET /diagnostics` server diagnostics
- `GET /diagnostics/printers/local` local DYMO status + printer list
- `GET /diagnostics/printers/rooms` status + printers for all configured rooms
- `GET /diagnostics/printers?room=roomA` status + printers for one room

## Templates

- Existing templates are in `labels/` and are used as fallback.
- You can add room/model-specific templates under `labels/<templatePrefix>/`.
    - Example: `labels/legacy/stor-true.label`

## Behavior

- Room selection is controlled in the top navbar.
- Room choice is saved in browser local storage.
- Room B failures are isolated so Room A printing can still work.
- Structured mode is always routed to Room B (550), regardless of selected classic room.
