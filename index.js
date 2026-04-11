const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs'); 
const jwt = require('jsonwebtoken'); // 🔴 ضفنا مكتبة التوكين
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

const SECRET_KEY = process.env.JWT_SECRET || 'AbulmagdSuperSecretKey2026'; // مفتاح التشفير

// 1. الاتصال بقاعدة البيانات
mongoose.connect('mongodb+srv://Abulmagd:Abulmagd610@cluster0.fac4uzx.mongodb.net/clincs?appName=Cluster0')
  .then(() => {
      console.log('✅ MongoDB Connected');
      createDefaultUser(); 
  })
  .catch(err => console.log('❌ DB Connection Error:', err));

// 2. الجداول (Schemas)

const UserSchema = new mongoose.Schema({
    name: String,
    username: { type: String, required: true, unique: true },
    password: String, 
    role: { type: String, default: 'user' } 
});
const User = mongoose.model('User', UserSchema);

const createDefaultUser = async () => {
    const count = await User.countDocuments();
    if (count === 0) {
        const hashedPassword = await bcrypt.hash('123', 10);
        const admin = new User({ name: 'أبو المجد', username: 'admin', password: hashedPassword, role: 'admin' });
        await admin.save();
        console.log('تم إنشاء حساب افتراضي مشفر: اليوزر (admin) - الباسورد (123)');
    }
};

const ClinicSchema = new mongoose.Schema({
    name: String,
    standardTime: String,
    workDays: [Number],
    shift: String,
    updatedBy: String // 🔴 حقل جديد لتسجيل مين اللي ضاف أو عدل العيادة
});
const Clinic = mongoose.model('Clinic', ClinicSchema);

const LogSchema = new mongoose.Schema({
    clinicId: { type: mongoose.Schema.Types.ObjectId, ref: 'Clinic' },
    clinicName: String,
    date: String,
    lecturer: String,          
    assistantLecturer: String, 
    doctorName: String,
    nurseName: String,
    actualTime: String,
    patientCount: Number,
    createdAt: { type: Date, default: Date.now },
    status: { type: String, default: 'completed' },
    updatedBy: String // 🔴 حقل جديد لتسجيل مين اللي دخل أو عدل اليومية
});
const Log = mongoose.model('Log', LogSchema);


// --- 🔴 Middleware لحماية الروابط والتأكد من وجود اليوزر ---
const authMiddleware = async (req, res, next) => {
    try {
        const token = req.header('Authorization').replace('Bearer ', '');
        const decoded = jwt.verify(token, SECRET_KEY);
        
        // لو اليوزر اتحذف من الداتابيز، السطر ده هيوقفه ويطرده
        const user = await User.findById(decoded.id);
        if (!user) throw new Error(); 

        req.user = user; // نحفظ بيانات اليوزر عشان نستخدمها في تسجيل التعديلات
        next();
    } catch (e) {
        res.status(401).json({ error: 'غير مصرح لك بالدخول أو تم حذف حسابك.' });
    }
};

// 3. API Routes

// --- Auth APIs ---

// مسار تسجيل الدخول (بيرجع التوكين للموبايل)
app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });
        if (user) {
            const isMatch = await bcrypt.compare(password, user.password);
            if (isMatch) {
                // 🔴 إنشاء التوكين
                const token = jwt.sign({ id: user._id, role: user.role }, SECRET_KEY);
                const { password: _, ...userData } = user.toObject(); 
                
                return res.json({ user: userData, token }); // 🔴 بنبعت الداتا + التوكين
            }
        }
        res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// جلب كل المستخدمين (محمي)
app.get('/users', authMiddleware, async (req, res) => {
    try { const users = await User.find().select('-password'); res.json(users); } 
    catch (err) { res.status(500).json({ error: err.message }); }
});

// إضافة أو تعديل مستخدم (محمي + معالجة تكرار اليوزر نيم)
app.post('/users', authMiddleware, async (req, res) => {
    try {
        const { id, name, username, password, role } = req.body;
        let updateData = { name, username, role };
        
        if (password && password.trim() !== '') {
            updateData.password = await bcrypt.hash(password, 10);
        }

        if (id) {
            await User.findByIdAndUpdate(id, updateData);
            res.json({ success: true });
        } else {
            if (!password) return res.status(400).json({error: 'الرقم السري مطلوب'});
            const newUser = new User(updateData);
            await newUser.save();
            res.json(newUser);
        }
    } catch (err) { 
        // 🔴 لو اليوزر نيم متكرر، مونجوديبي بترمي إيرور كوده 11000
        if (err.code === 11000) {
            return res.status(400).json({ error: 'اسم المستخدم (Username) موجود بالفعل، اختر اسماً آخر.' });
        }
        res.status(500).json({ error: err.message }); 
    }
});

// حذف مستخدم (محمي)
app.delete('/users/:id', authMiddleware, async (req, res) => {
    try { await User.findByIdAndDelete(req.params.id); res.json({ success: true }); } 
    catch (err) { res.status(500).json({ error: err.message }); }
});


// --- APIs العيادات والسجلات (كلها محمية بـ authMiddleware) ---

app.get('/clinics', authMiddleware, async (req, res) => {
    try { const clinics = await Clinic.find(); res.json(clinics); } 
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/clinics', authMiddleware, async (req, res) => {
    try { 
        // 🔴 بنضيف اسم اليوزر اللي عمل العيادة
        const newClinic = new Clinic({ ...req.body, updatedBy: req.user.name }); 
        await newClinic.save(); 
        res.json(newClinic); 
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/clinics/:id', authMiddleware, async (req, res) => {
    try { await Clinic.findByIdAndDelete(req.params.id); res.json({ message: 'Deleted' }); } 
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/clinics/:id', authMiddleware, async (req, res) => {
    try { 
        // 🔴 بنحدث اسم اليوزر اللي عدل العيادة
        const dataToUpdate = { ...req.body, updatedBy: req.user.name };
        const updated = await Clinic.findByIdAndUpdate(req.params.id, dataToUpdate, { new: true }); 
        res.json(updated); 
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/logs', authMiddleware, async (req, res) => {
    try {
        const { date } = req.query;
        const query = date ? { date } : {};
        const logs = await Log.find(query);
        res.json(logs);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/logs', authMiddleware, async (req, res) => {
    try {
        const { clinicId, date, lecturer, assistantLecturer, doctorName, nurseName, actualTime, patientCount, clinicName } = req.body;
        let log = await Log.findOne({ clinicId, date });
        
        if (log) {
            log.lecturer = lecturer;
            log.assistantLecturer = assistantLecturer;
            log.doctorName = doctorName;
            log.nurseName = nurseName;
            log.actualTime = actualTime;
            log.patientCount = patientCount;
            log.updatedBy = req.user.name; // 🔴 تسجيل اسم اللي عدل السجل
            await log.save();
        } else {
            log = new Log({ 
                clinicId, clinicName, date, lecturer, assistantLecturer, doctorName, nurseName, actualTime, patientCount,
                updatedBy: req.user.name // 🔴 تسجيل اسم اللي ضاف السجل
            });
            await log.save();
        }
        res.json(log);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/logs/:id', authMiddleware, async (req, res) => {
  try {
    const dataToUpdate = { ...req.body, updatedBy: req.user.name }; // 🔴 تسجيل التعديل
    const updatedLog = await Log.findByIdAndUpdate(req.params.id, dataToUpdate, { new: true });
    res.json(updatedLog);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/logs/:id', authMiddleware, async (req, res) => {
  try {
    await Log.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
