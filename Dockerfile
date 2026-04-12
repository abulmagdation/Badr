# استخدام نسخة خفيفة وسريعة من Node.js 22
FROM node:22-alpine

# تحديد مسار العمل جوه السيرفر
WORKDIR /usr/src/app

# نسخ ملفات الحزم الأول عشان الكاش
COPY package*.json ./

# تسطيب الحزم (المكتبات)
RUN npm install

# نسخ باقي ملفات المشروع
COPY . .

# تحديد البورت اللي المشروع شغال عليه
EXPOSE 8080

# أمر تشغيل المشروع
CMD [ "node", "index.js" ]
