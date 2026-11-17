# SLURP Home Café — Online Ordering System

This project contains:
- Customer-facing menu and cart.
- Real checkout that saves orders to a SQLite database on the server.
- Admin dashboard at `/admin`.
- Admin login, order list, and order-status updates.
- Server-side price calculation (the browser cannot change menu prices).
- Basic security headers, request-size limit, and API rate limiting.

## Requirements
- Node.js 20 or newer
- npm

## Run on your computer (Windows)
1. Extract this ZIP file.
2. Open the extracted `slurp_ordering_system` folder.
3. In that folder, open PowerShell or Command Prompt.
4. Run:

   ```bash
   npm install
   ```

5. Set the admin password and session secret (PowerShell):

   ```powershell
   $env:ADMIN_PASSWORD="Choose-A-Strong-Private-Password"
   $env:SESSION_SECRET="replace-this-with-a-long-random-secret"
   npm start
   ```

   In Command Prompt, use:

   ```cmd
   set ADMIN_PASSWORD=Choose-A-Strong-Private-Password
   set SESSION_SECRET=replace-this-with-a-long-random-secret
   npm start
   ```

6. Open `http://localhost:3000` for customers.
7. Open `http://localhost:3000/admin` for the private order dashboard.
8. Place a test order from the website and confirm it appears in the dashboard.

The database file `slurp.sqlite` is created automatically in the project folder.

## Order flow
- Customers add menu items to cart.
- They enter name, phone, address, delivery/pickup and payment choice.
- The server checks the item IDs and calculates the prices itself.
- The order is stored in the database and the customer sees an order number.
- Slurp opens `/admin`, logs in, sees the order and updates its status.

## Payment and delivery notes
- This version accepts Cash on Delivery and Cash on Pickup. It does not collect card or online payments.
- Delivery charges are not included because no delivery fee or delivery zones were supplied. Add these before accepting paid delivery orders if needed.
- The website records the order; it does not automatically arrange a rider or send SMS notifications.
- Before going live, test the flow and set the admin password to a strong private value.

## Deploying publicly
You need a Node.js host and persistent disk/database storage. SQLite needs persistent storage mounted to the app and `DB_FILE` set to a path on that disk. Do not deploy this SQLite build to a host with an ephemeral filesystem or orders can be lost on restart/redeploy. For a production multi-instance setup, migrate the database to PostgreSQL.

Set these environment variables on your host:
- `ADMIN_PASSWORD` — strong dashboard password
- `SESSION_SECRET` — long random secret (session tokens are currently random; keep a secret set as required)
- `NODE_ENV=production`
- `DB_FILE` — path on persistent disk, e.g. `/var/data/slurp.sqlite`
- `PORT` — normally supplied by the host

Use HTTPS. Keep admin credentials private. Back up the database regularly.

## Customization
Menu prices and names used for secure server-side checkout are in `server.js` (`catalog`). The visible descriptions, images and menu content are in `public/index.html`.
