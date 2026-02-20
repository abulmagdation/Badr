// index.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs'); // للتشفير
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

// 1. الاتصال بقاعدة البيانات
mongoose.connect('mongodb+srv://abulmagd:Abulmagd610@cluster0.blq59le.mongodb.net/?appName=Cluster0')
  .then(() => {
      console.log('✅ MongoDB Connected');
      createDefaultUser(); // إنشاء مستخدم افتراضي
  })
  .catch(err => console.log('❌ DB Connection Error:', err));

// 2. الجداول (Schemas)


// جدول المستخدمين
const UserSchema = new mongoose.Schema({
    name: String,
    username: { type: String, unique: true },
    password: String, // هنا هيتخزن الباسورد متشفر
    role: { type: String, default: 'user' } // 'admin' أو 'user'
});
const User = mongoose.model('User', UserSchema);

// دالة لإنشاء حساب افتراضي لو الداتابيز فاضية عشان تقدر تدخل
const createDefaultUser = async () => {
    const count = await User.countDocuments();
    if (count === 0) {
        const hashedPassword = await bcrypt.hash('123', 10);
        const admin = new User({ name: 'أبو المجد', username: 'admin', password: hashedPassword, role: 'admin' });
        await admin.save();
        console.log('تم إنشاء حساب افتراضي مشفر: اليوزر (admin) - الباسورد (123)');
    }
};
createDefaultUser();


// جدول العيادات
const ClinicSchema = new mongoose.Schema({
    name: String,
    standardTime: String,
    workDays: [Number],
    shift: String
});
const Clinic = mongoose.model('Clinic', ClinicSchema);




// جدول السجلات
const LogSchema = new mongoose.Schema({
    clinicId: { type: mongoose.Schema.Types.ObjectId, ref: 'Clinic' },
    clinicName: String,
    date: String,
    lecturer: String,          // جديد
    assistantLecturer: String, // جديد
    doctorName: String,
    nurseName: String,
    actualTime: String,
    patientCount: Number,
    createdAt: { type: Date, default: Date.now }
});
const Log = mongoose.model('Log', LogSchema);

// 3. API Routes

// --- Auth APIs (NEW) ---

// جلب كل المستخدمين
app.get('/users', async (req, res) => {
    try { const users = await User.find().select('-password'); res.json(users); } 
    catch (err) { res.status(500).json({ error: err.message }); }
});

// إضافة أو تعديل مستخدم (مع التشفير)
app.post('/users', async (req, res) => {
    try {
        const { id, name, username, password, role } = req.body;
        let updateData = { name, username, role };
        
        // لو كتب باسورد جديد نشفره
        if (password && password.trim() !== '') {
            updateData.password = await bcrypt.hash(password, 10);
        }

        if (id) {
            await User.findByIdAndUpdate(id, updateData);
            res.json({ success: true });
        } else {
            // إضافة مستخدم جديد لازم باسورد
            if (!password) return res.status(400).json({error: 'الرقم السري مطلوب'});
            const newUser = new User(updateData);
            await newUser.save();
            res.json(newUser);
        }
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// حذف مستخدم
app.delete('/users/:id', async (req, res) => {
    try { await User.findByIdAndDelete(req.params.id); res.json({ success: true }); } 
    catch (err) { res.status(500).json({ error: err.message }); }
});


// مسار تسجيل الدخول (مع مقارنة التشفير)
app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });
        if (user) {
            const isMatch = await bcrypt.compare(password, user.password);
            if (isMatch) {
                const { password: _, ...userData } = user.toObject(); // نشيل الباسورد قبل ما نبعت الداتا للموبايل
                return res.json(userData);
            }
        }
        res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});


// --- APIs العيادات والسجلات (زي ما هي) ---
app.get('/clinics', async (req, res) => {
    try { const clinics = await Clinic.find(); res.json(clinics); } 
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/clinics', async (req, res) => {
    try { const newClinic = new Clinic(req.body); await newClinic.save(); res.json(newClinic); } 
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/clinics/:id', async (req, res) => {
    try { await Clinic.findByIdAndDelete(req.params.id); res.json({ message: 'Deleted' }); } 
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/clinics/:id', async (req, res) => {
    try { const updated = await Clinic.findByIdAndUpdate(req.params.id, req.body, { new: true }); res.json(updated); } 
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/logs', async (req, res) => {
    try {
        const { date } = req.query;
        const query = date ? { date } : {};
        const logs = await Log.find(query);
        res.json(logs);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/logs', async (req, res) => {
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
            await log.save();
        } else {
            log = new Log({ clinicId, clinicName, date, lecturer, assistantLecturer, doctorName, nurseName, actualTime, patientCount });
            await log.save();
        }
        res.json(log);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));