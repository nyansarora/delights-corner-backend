const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const http = require('http');
const { Sequelize, DataTypes } = require('sequelize');
const axios = require('axios');

const app = express();
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { 
    cors: { 
        origin: "*",
        methods: ["GET", "POST"]
    } 
});
const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: './restaurant.sqlite',
    logging: false
});

// 1. Table for Users
const User = sequelize.define('User', {
    username: { type: DataTypes.STRING, unique: true, allowNull: false },
    name: { type: DataTypes.STRING, allowNull: false },
    email: { type: DataTypes.STRING, allowNull: false },
    password: { type: DataTypes.STRING, allowNull: false }, 
    role: { type: DataTypes.STRING, allowNull: false } // 'customer', 'admin', 'kitchen', 'rider'
});

// 2. Table for Orders
const Order = sequelize.define('Order', {
    items: DataTypes.TEXT,
    totalPrice: DataTypes.DECIMAL(10, 2),
    status: { type: DataTypes.STRING, defaultValue: 'Preparing' },
    customerName: DataTypes.STRING,
    phoneNumber: DataTypes.STRING,
    location: DataTypes.STRING,
    mpesaCode: DataTypes.STRING,
    riderName: DataTypes.STRING
});

// 3. Table for Menu Items
const MenuItem = sequelize.define('MenuItem', {
    name: DataTypes.STRING,
    price: DataTypes.DECIMAL(10, 2),
    image: DataTypes.STRING,
    category: DataTypes.STRING, // 'breakfast', 'lunch_dinner', 'others'
    isAvailable: { type: DataTypes.BOOLEAN, defaultValue: true }
});

// 4. Table for Customer Feedback Reviews
const Feedback = sequelize.define('Feedback', {
    customerName: { type: DataTypes.STRING, allowNull: false },
    stars: { type: DataTypes.INTEGER, allowNull: false },
    comment: { type: DataTypes.TEXT, allowNull: false }
});

// M-Pesa Live Environment Keys Map
const mpesaKeys = {
    consumerKey: "c3zND8aQI8pR1zVw3wRpenGgwYXaGfDNgQHOvUENGgvl8jWF",
    consumerSecret: "eFuRulNvELRzGvSkusqmAlFrsCNUA8TIz59PqGsMgeFeG9TyoYAsWK1GYAoOT27W",
    shortcode: "174379", 
    passkey: "bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919", 
    callbackUrl: "https://barbed-patriot-elevator.ngrok-free.dev/mpesa-callback"
};

// Helper: Generate timestamp format (YYYYMMDDHHmmss)
const getTimestamp = () => {
    const date = new Date();
    const pad = (n) => (n < 10 ? '0' : '') + n;
    return (
        date.getFullYear() +
        pad(date.getMonth() + 1) +
        pad(date.getDate()) +
        pad(date.getHours()) +
        pad(date.getMinutes()) +
        pad(date.getSeconds())
    );
};

// M-Pesa Access Token Authorization Handshake
async function getMpesaToken(req, res, next) {
    const auth = Buffer.from(`${mpesaKeys.consumerKey}:${mpesaKeys.consumerSecret}`).toString('base64');
    try {
        const response = await axios.get('https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials', {
            headers: { Authorization: `Basic ${auth}` }
        });
        req.mpesaToken = response.data.access_token;
        next();
    } catch (e) {
        console.error("Daraja Auth Error:", e.response ? e.response.data : e.message);
        res.status(500).json({ error: "Failed to generate Daraja access token link." });
    }
}

// System Database Sync & Full Seed Payload Execution Block
sequelize.sync({ alter: true })
    .then(async () => {
        console.log("Database synced successfully!");
        
        const userCount = await User.count();
        if (userCount === 0) {
            await User.bulkCreate([
                { username: "admin", name: "System Admin", email: "admin@delights.com", password: "123", role: "admin" },
                { username: "kitchen", name: "Kitchen Chef", email: "kitchen@delights.com", password: "123", role: "kitchen" },
                { username: "rider1", name: "Rider One", email: "rider@delights.com", password: "123", role: "rider" },
                { username: "customer1", name: "Customer One", email: "cust@delights.com", password: "123", role: "customer" }
            ]);
            console.log("Default administrative staff profiles seeded!");
        }

        const menuCount = await MenuItem.count();
        if (menuCount === 0) {
            await MenuItem.bulkCreate([
                // BREAKFAST OPTIONS
                { name: "African Tea (Medium Cup)", price: 30.00, category: "breakfast", image: "https://weeatatlast.com/wp-content/uploads/2021/02/Chai-ya-Tangawizi-African-Ginger-Tea-with-Milk-min.jpg", isAvailable: true },
                { name: "African Tea (Large Cup)", price: 50.00, category: "breakfast", image: "https://weeatatlast.com/wp-content/uploads/2021/02/Chai-ya-Tangawizi-African-Ginger-Tea-with-Milk-min.jpg", isAvailable: true },
                { name: "Mandazi", price: 10.00, category: "breakfast", image: "https://weeatatlast.com/wp-content/uploads/2022/02/soft-mandazi-recipe.jpg", isAvailable: true },
                { name: "Chapati", price: 15.00, category: "breakfast", image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTs4S8QK9deM7pGujWcNTCVsssDksW-fglwZQ&s", isAvailable: true },
                { name: "Hard Boiled Egg", price: 30.00, category: "breakfast", image: "https://images.unsplash.com/photo-1587486913049-53fc88980cfc?w=500", isAvailable: true },
                { name: "Porridge", price: 30.00, category: "breakfast", image: "https://tasteofsouthsudan.com/wp-content/uploads/2016/09/FInger-millet-porridge.jpg", isAvailable: true },
                { name: "Beef Samosa", price: 25.00, category: "breakfast", image: "https://images.unsplash.com/photo-1666190091090-1d312a4b04c2?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8Nnx8Zm9vZCUyMHNhbW9zYXxlbnwwfHwwfHx8MA%3D%3D", isAvailable: true },
                
                // LUNCH / DINNER OPTIONS 
                { name: "Ugali", price: 30.00, category: "lunch_dinner", image: "https://miro.medium.com/v2/resize:fit:640/format:webp/1*yC9JWW0o5r6Nt1iveuSQ8g.jpeg", isAvailable: true },
                { name: "Fried Eggs", price: 50.00, category: "lunch_dinner", image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSGKwyZ4KzriwwBLTTC4LraQHMt3sOqh6z7gA&s", isAvailable: true },
                { name: "Ugali + Greens + Fried Eggs", price: 100.00, category: "lunch_dinner", image: "https://i.redd.it/ugali-mayai-v0-6asmkhd84eqd1.jpg?width=1080&format=pjpg&auto=webp&s=7794bbc7985ef6920c5b95584f4a93414a5ae022", isAvailable: true },
                { name: "Rice", price: 40.00, category: "lunch_dinner", image: "https://www.everyday-delicious.com/wp-content/uploads/2022/05/jasmin-rice-everyday-delicious-2.jpg", isAvailable: true },
                { name: "Beans", price: 40.00, category: "lunch_dinner", image: "https://www.seasonsandsuppers.ca/wp-content/uploads/2020/03/baked-beans-2-3.jpg", isAvailable: true },
                { name: "Ndengu", price: 40.00, category: "lunch_dinner", image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR6dPzXrwIYjKyLczeCfVYvMqiTA3mlaPFgrg&s", isAvailable: true },
                { name: "Ugali Mix (Ugali + Greens + Meat)", price: 120.00, category: "lunch_dinner", image: "https://i.pinimg.com/736x/22/31/f4/2231f4087f369157e3d2651f6fa434f7.jpg", isAvailable: true },
                { name: "Matoke", price: 100.00, category: "lunch_dinner", image: "https://healthiersteps.com/wp-content/uploads/2018/01/matoke-overlay-2.jpg", isAvailable: true },
                { name: "Githeri", price: 70.00, category: "lunch_dinner", image: "https://d34vm3j4h7f97z.cloudfront.net/original/4X/9/9/5/995e4a6ea324b3397f04c96fe3ad5d90135e0bce.jpeg", isAvailable: true },
                { name: "Ugali Matumbo", price: 140.00, category: "lunch_dinner", image: "https://instapilau.com/media/images/2024/11/27/Ugali_and_Matumbo_is_a_popular_Kenyan_dish.jpg", isAvailable: true },
                { name: "Fries", price: 100.00, category: "lunch_dinner", image: "https://www.recipetineats.com/tachyon/2022/09/Seasoning-french-fries.jpg", isAvailable: true },
                { name: "Rice and Beef Stew", price: 180.00, category: "lunch_dinner", image: "https://www.fufuskitchen.com/wp-content/uploads/2020/11/IMG_7795_jpg-768x868.webp", isAvailable: true },
                { name: "Pilau Mix", price: 120.00, category: "lunch_dinner", image: "https://eatwellabi.com/wp-content/uploads/2022/06/Kenyan-Pilau-5-360x360.jpg", isAvailable: true },
                
                // OTHERS CATEGORY
                { name: "Viazi Karai", price: 70.00, category: "others", image: "https://masalabasics.com/wp-content/uploads/2020/12/Marus-Bhajia-Body.jpg", isAvailable: true },
                { name: "Smocha", price: 60.00, category: "others", image: "https://jikonisecrets.co.ke/wp-content/uploads/2025/12/Smocha-Recipe-768x432.png", isAvailable: true }
            ]);
            console.log("All food asset records successfully seeded with updated image URLs!");
        }
    })
    .catch(err => console.log("SQL Sync error:", err));

// Core Operations Routes API
app.post('/login', async (req, res) => {
    const user = await User.findOne({ where: { username: req.body.username, password: req.body.password } });
    if(user) res.json({ success: true, role: user.role, username: user.username, name: user.name });
    else res.status(401).json({ success: false, message: "Invalid username or password credentials!" });
});

app.post('/signup', async (req, res) => {
    try {
        const { username, password, name, email, role } = req.body;
        if (!username || !password || !role) {
            return res.status(400).json({ success: false, message: "Missing required identification keys." });
        }
        if (role === 'admin') {
            return res.status(403).json({ success: false, message: "Administrator registration pathways are blocked directly." });
        }
        const user = await User.create({
            username: username.trim(),
            password: password,
            name: name ? name.trim() : username,
            email: email ? email.trim() : "",
            role: role
        });
        res.json({ success: true, role: user.role, username: user.username, name: user.name });
    } catch(err) {
        res.status(500).json({ success: false, message: "Could not compile account profile rows." });
    }
});

app.get('/menu', async (req, res) => { res.json(await MenuItem.findAll()); });

app.post('/menu/add', async (req, res) => {
    try {
        const { name, price, category, image } = req.body;
        if (!name || isNaN(price) || price <= 0 || name.length > 80) {
            return res.status(400).json({ error: "Provide a valid item name and price value." });
        }
        await MenuItem.create({
            name: name.trim(),
            price: parseFloat(price),
            category: category || "others",
            image: image || "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=500"
        });
        io.emit('menu-updated');
        res.json({ message: "Success" });
    } catch(e) { res.status(500).json({ error: "Failed to construct item data entry." }); }
});

app.post('/menu/toggle-availability', async (req, res) => {
    const { id, isAvailable } = req.body;
    await MenuItem.update({ isAvailable }, { where: { id } });
    io.emit('menu-updated');
    res.json({ success: true });
});

app.get('/orders', async (req, res) => { res.json(await Order.findAll()); });

// Real Live Interactive M-Pesa STK Push Integration Route
app.post('/new-order', getMpesaToken, async (req, res) => {
    try {
        const { items, totalPrice, customerName, phoneNumber, location } = req.body;
        const finalPriceWithLogistics = parseFloat(totalPrice) + 50.00;
        const tempTrackingCode = "STK" + Math.random().toString(36).substr(2, 6).toUpperCase();
        
        let formattedPhone = phoneNumber.replace(/\s/g, '');
        if (formattedPhone.startsWith('0')) formattedPhone = '254' + formattedPhone.slice(1);
        if (formattedPhone.startsWith('+')) formattedPhone = formattedPhone.slice(1);

        const timestamp = getTimestamp();
        const mpesaPassword = Buffer.from(mpesaKeys.shortcode + mpesaKeys.passkey + timestamp).toString('base64');

        const stkPayload = {
            BusinessShortCode: mpesaKeys.shortcode,
            Password: mpesaPassword,
            Timestamp: timestamp,
            TransactionType: "CustomerPayBillOnline", 
            Amount: Math.round(finalPriceWithLogistics),
            PartyA: formattedPhone,
            PartyB: mpesaKeys.shortcode,
            PhoneNumber: formattedPhone,
            CallBackURL: mpesaKeys.callbackUrl,
            AccountReference: "DelightsCorner",
            TransactionDesc: "Delights Corner Food Payment"
        };

        await axios.post('https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest', stkPayload, {
            headers: { Authorization: `Bearer ${req.mpesaToken}` }
        });

        const order = await Order.create({ 
            items: JSON.stringify(items), 
            totalPrice: finalPriceWithLogistics, 
            customerName, 
            phoneNumber: formattedPhone, 
            location,
            status: 'Pending Payment', 
            mpesaCode: tempTrackingCode
        });

        io.emit('order-alert');
        res.json({ success: true, mpesaCode: tempTrackingCode, orderId: order.id });
    } catch(e) {
        console.error("STK Push Error:", e.response ? e.response.data : e.message);
        res.status(500).json({ error: "Failed to broadcast payment prompt request." });
    }
});

// Inbound Real-Time Safaricom Gateway Transaction Callback Listener
app.post('/mpesa-callback', async (req, res) => {
    try {
        const { ResultCode, CallbackMetadata } = req.body.Body.stkCallback;
        
        if (ResultCode === 0 && CallbackMetadata && CallbackMetadata.Item) {
            const metadataItems = CallbackMetadata.Item;
            
            const receiptNode = metadataItems.find(i => i.Name === "MpesaReceiptNumber");
            const phoneNode = metadataItems.find(i => i.Name === "PhoneNumber");
            
            const mpesaReceipt = receiptNode ? receiptNode.Value : "STK_VERIFIED";
            const customerPhone = phoneNode ? String(phoneNode.Value) : null;

            if (customerPhone) {
                await Order.update(
                    { status: 'Preparing', mpesaCode: mpesaReceipt },
                    { where: { phoneNumber: customerPhone, status: 'Pending Payment' } }
                );
                io.emit('order-alert');
            }
        }
        res.json({ ResultCode: 0, ResultDesc: "Accepted Success Callback Handshake" });
    } catch (e) {
        console.error("Callback Route Fault:", e);
        res.status(500).json({ error: "Callback processing execution fault." });
    }
});

// Operational Dashboard Delivery Routing Realization Infrastructure
app.post('/claim-delivery', async (req, res) => {
    await Order.update({ riderName: req.body.riderName, status: 'Out for Delivery' }, { where: { id: req.body.orderId } });
    io.emit('status-update', { orderId: req.body.orderId, status: 'Out for Delivery', riderName: req.body.riderName });
    res.json({ success: true });
});

app.post('/update-status', async (req, res) => {
    try {
        const { orderId, newStatus } = req.body;
        
        // Fetch order properties to track what is changing
        const order = await Order.findByPk(orderId);
        if (!order) {
            return res.status(404).json({ success: false, message: "Order records match not found." });
        }

        // Prepare update object metrics dynamically
        const updateFields = { status: newStatus };

        // If kitchen explicitly approves a pending order manually, assign a manual verification code tag
        if (newStatus === 'Preparing' && order.status === 'Pending Payment') {
            updateFields.mpesaCode = "MANUAL_KITCHEN_" + Math.random().toString(36).substr(2, 5).toUpperCase();
        }

        await Order.update(updateFields, { where: { id: orderId } });
        
        // Broadcast change events instantly across both customer and kitchen view ports
        io.emit('status-update', { orderId, status: newStatus });
        io.emit('order-alert'); 
        
        res.json({ success: true });
    } catch(e) {
        console.error("Dashboard Status Modification Error:", e);
        res.status(500).json({ error: "Failed to execute pipeline status state adjustments parameters." });
    }
});
;
app.post('/cancel-order', async (req, res) => {
    try {
        const { orderId } = req.body;
        
        // Find the order first to make sure it's still in a state that can be cancelled
        const order = await Order.findByPk(orderId);
        
        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found." });
        }

        // Security check: Only allow cancellation if it's still pending payment 
        if (order.status === 'Pending Payment' ) {
            await Order.update({ status: 'Cancelled' }, { where: { id: orderId } });
            
            // Instantly notify the kitchen and admin dashboards to clear the order
            io.emit('status-update', { orderId, status: 'Cancelled' });
            io.emit('order-alert'); 
            
            return res.json({ success: true, message: "Order cancelled successfully." });
        } else {
            return res.status(400).json({ 
                success: false, 
                message: "Cannot cancel order. It is already out for delivery or completed." 
            });
        }
    } catch (e) {
        console.error("Cancellation Error:", e);
        res.status(500).json({ error: "Failed to process order cancellation." });
    }
});

// User-Generated Reviews Feedback Pipelines Engine Endpoints
app.get('/feedback', async (req, res) => {
    try { res.json(await Feedback.findAll({ order: [['createdAt', 'DESC']] })); } catch(e) { res.status(500).json({ error: "Failed to load database logs." }); }
});

app.post('/feedback/add', async (req, res) => {
    try {
        const { customerName, stars, comment } = req.body;
        const review = await Feedback.create({
            customerName: customerName ? customerName.trim() : "Customer",
            stars: parseInt(stars) || 5,
            comment: comment ? comment.trim() : ""
        });
        res.json(review);
    } catch(e) { res.status(500).json({ error: "Failed to persist review payload object mapping properties." }); }
});

// ═══════════════════════════════════════
// SOCKET.IO REAL-TIME ROUTING GATEWAY
// ═══════════════════════════════════════
io.on('connection', (socket) => {
    console.log(`🔌 New client connected to live system engine: ${socket.id}`);

    // Listen for live location streams from the rider's phone browser
    socket.on('rider-location-update', (data) => {
        // Instantly route coordinates to all open customer dashboards
        io.emit('live-location-stream', data);
    });

    socket.on('disconnect', () => {
        console.log(`🔌 Client disconnected: ${socket.id}`);
    });
});

server.listen(5000, () => console.log(' Delights Corner Live System Engine active on Port 5000'));