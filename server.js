const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const SESSION_SECRET = process.env.SESSION_SECRET;
if (!ADMIN_PASSWORD || !SESSION_SECRET) {
  console.error('Set ADMIN_PASSWORD and SESSION_SECRET environment variables before starting.');
  process.exit(1);
}
const db = new Database(process.env.DB_FILE || path.join(__dirname, 'slurp.sqlite'));
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS orders (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 customer_name TEXT NOT NULL,
 phone TEXT NOT NULL,
 address TEXT NOT NULL,
 order_type TEXT NOT NULL,
 payment_method TEXT NOT NULL,
 notes TEXT DEFAULT '',
 items_json TEXT NOT NULL,
 total INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'Pending',
 created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
`);

const catalog = {
 momo:{name:'Chicken Momos',price:500}, cheese:{name:'Chicken Cheese Momos',price:550},
 road:{name:'Road-Style Noodles',price:450}, garlic:{name:'Garlic Noodles',price:450},
 pasta:{name:'Creamy White Sauce Pasta',price:700}, corndog:{name:'Korean-Style Chicken Corn Dog',price:500},
 mozz:{name:'Mozzarella Sticks',price:550}, fries:{name:'Loaded Fries',price:600},
 mash:{name:'Garlic Mashed Potatoes',price:500}, choco:{name:'Chocolate Shake',price:600},
 kitkat:{name:'KitKat Shake',price:600}, nutella:{name:'Nutella Shake',price:600},
 banana:{name:'Banana Smoothie',price:450}, lemon:{name:'Mint Lemonade',price:450},
 crepe:{name:'Nutella Crêpe',price:500}, deal:{name:'The Slurp Snack Box',price:850}
};
app.use(helmet({contentSecurityPolicy:false}));
app.use(express.json({limit:'30kb'}));
app.use(express.static(path.join(__dirname,'public')));
app.use('/api/', rateLimit({windowMs:15*60*1000,limit:40,standardHeaders:true,legacyHeaders:false}));

function cleanText(value,max=500){return typeof value==='string'?value.trim().slice(0,max):'';}
function calculateItems(input){
 if(!Array.isArray(input)||input.length<1||input.length>30) throw new Error('Please add at least one menu item.');
 let items=[],total=0;
 for(const row of input){
  const p=catalog[row?.id],q=Number(row?.quantity);
  if(!p||!Number.isInteger(q)||q<1||q>50) throw new Error('One of the selected items is invalid.');
  items.push({id:row.id,name:p.name,quantity:q,unitPrice:p.price,lineTotal:p.price*q});
  total+=p.price*q;
 }
 if(total>200000) throw new Error('Order total is too high. Please contact Slurp.');
 return {items,total};
}
app.post('/api/orders',(req,res)=>{
 try{
  const customerName=cleanText(req.body.customerName,100),phone=cleanText(req.body.phone,30),address=cleanText(req.body.address,600);
  const orderType=cleanText(req.body.orderType,30),paymentMethod=cleanText(req.body.paymentMethod,40),notes=cleanText(req.body.notes,500);
  if(customerName.length<2||phone.length<7||address.length<5) return res.status(400).json({error:'Please enter a valid name, phone number and address.'});
  if(!['Home delivery','Self pickup'].includes(orderType)) return res.status(400).json({error:'Invalid order type.'});
  if(!['Cash on delivery','Cash on pickup'].includes(paymentMethod)) return res.status(400).json({error:'Invalid payment method.'});
  if(orderType==='Home delivery'&&paymentMethod!=='Cash on delivery') return res.status(400).json({error:'Home delivery orders must use cash on delivery.'});
  if(orderType==='Self pickup'&&paymentMethod!=='Cash on pickup') return res.status(400).json({error:'Pickup orders must use cash on pickup.'});
  const {items,total}=calculateItems(req.body.items);
  const info=db.prepare(`INSERT INTO orders(customer_name,phone,address,order_type,payment_method,notes,items_json,total)
   VALUES(?,?,?,?,?,?,?,?)`).run(customerName,phone,address,orderType,paymentMethod,notes,JSON.stringify(items),total);
  res.status(201).json({ok:true,orderId:info.lastInsertRowid,total});
 }catch(e){res.status(400).json({error:e.message||'Unable to place order.'});}
});

// Small in-memory admin sessions. Restarting the server logs admins out.
const sessions=new Map();
const sessionCookie='slurp_admin';
function parseCookies(req){return Object.fromEntries((req.headers.cookie||'').split(';').map(x=>x.trim()).filter(Boolean).map(x=>{const i=x.indexOf('=');return [x.slice(0,i),decodeURIComponent(x.slice(i+1))]}));}
function requireAdmin(req,res,next){
 const token=parseCookies(req)[sessionCookie],session=sessions.get(token);
 if(!token||!session||session.expires<Date.now()){if(token)sessions.delete(token);return res.status(401).json({error:'Please log in again.'});}
 next();
}
app.get('/admin',(req,res)=>res.sendFile(path.join(__dirname,'public','admin.html')));
app.post('/api/admin/login',rateLimit({windowMs:15*60*1000,limit:8,standardHeaders:true,legacyHeaders:false}), (req,res)=>{
 const password=String(req.body.password||'');
 const a=Buffer.from(password),b=Buffer.from(ADMIN_PASSWORD);
 if(a.length!==b.length||!crypto.timingSafeEqual(a,b)) return res.status(401).json({error:'Incorrect password.'});
 const token=crypto.randomBytes(32).toString('hex');
 sessions.set(token,{expires:Date.now()+8*60*60*1000});
 res.setHeader('Set-Cookie',`${sessionCookie}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${process.env.NODE_ENV==='production'?'; Secure':''}`);
 res.json({ok:true});
});
app.post('/api/admin/logout',requireAdmin,(req,res)=>{
 const token=parseCookies(req)[sessionCookie];sessions.delete(token);
 res.setHeader('Set-Cookie',`${sessionCookie}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${process.env.NODE_ENV==='production'?'; Secure':''}`);
 res.json({ok:true});
});
app.get('/api/admin/orders',requireAdmin,(req,res)=>{
 const rows=db.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT 300').all();
 res.json({orders:rows.map(r=>({...r,items:JSON.parse(r.items_json)}))});
});
app.patch('/api/admin/orders/:id',requireAdmin,(req,res)=>{
 const status=String(req.body.status||'');
 if(!['Pending','Confirmed','Preparing','Ready for pickup','Out for delivery','Delivered','Cancelled'].includes(status)) return res.status(400).json({error:'Invalid status.'});
 const result=db.prepare('UPDATE orders SET status=? WHERE id=?').run(status,Number(req.params.id));
 if(!result.changes)return res.status(404).json({error:'Order not found.'});
 res.json({ok:true});
});
app.get('/api/health',(req,res)=>res.json({ok:true,service:'Slurp ordering'}));
app.listen(PORT,()=>console.log(`Slurp ordering system running on http://localhost:${PORT}`));
