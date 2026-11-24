# ตั้งค่า Supabase สำหรับระบบบัญชีและประวัติ

1. สร้างโปรเจกต์ Supabase และรัน `supabase/migrations/001_exam_attempts.sql` ใน SQL Editor ของโปรเจกต์ใหม่เพียงครั้งเดียว ตารางนี้เปิด Row Level Security และให้ผู้ใช้ที่เข้าสู่ระบบ อ่านและแก้ไขได้เฉพาะแถวที่เป็นของตนเอง ทดสอบด้วยบัญชีอย่างน้อยสองบัญชีและตรวจสอบว่าอ่านหรือเขียนข้อมูลของอีกบัญชีไม่ได้ก่อนเปิดใช้งานจริง
2. เปิด Email/password ใน Authentication ตั้งค่า email confirmation และ URL ของเว็บจริงใน Site URL รวมถึง URL สำหรับ redirect ที่ใช้จริงเท่านั้น โปรดดู [การตั้งค่า Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls) และใช้ HTTPS สำหรับเว็บจริง
3. ตั้งค่า Google OAuth ตาม [คู่มือ Google ของ Supabase](https://supabase.com/docs/guides/auth/social-login/auth-google) โดยสร้าง OAuth client บน Google Cloud และกำหนด callback ของ Supabase ให้ตรงกัน เก็บ client secret ไว้ใน Supabase เท่านั้น ห้ามใส่ในเว็บหรือ Git
4. ใช้ custom SMTP สำหรับอีเมลยืนยันและกู้รหัสผ่านในระบบจริง: อีเมลเริ่มต้นของ Supabase ส่งได้เฉพาะสมาชิกทีมที่ได้รับอนุญาตและจำกัดจำนวนมาก ตรวจสอบค่าใช้จ่ายของผู้ให้บริการอีเมลด้วย ดู [คู่มือ SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
5. Guest เก็บข้อมูลในเบราว์เซอร์ ไม่สร้างบัญชี anonymous บน Supabase ผู้ใช้สามารถคัดลอกประวัติ Guest จากเครื่องเดิมเข้าบัญชีหลังเข้าสู่ระบบได้ ข้อมูล Guest ไม่สามารถกู้จากเครื่องอื่นได้หากล้างข้อมูลเบราว์เซอร์ก่อนคัดลอก
6. ตั้งค่า rate limits และ bot protection ให้เหมาะสม พิจารณา CAPTCHA หรือ Turnstile เพื่อป้องกันการสมัครบัญชีจำนวนมาก ต้องเชื่อม CAPTCHA ในหน้าเว็บและส่ง token กับคำขอ Auth ก่อนเปิดการบังคับ CAPTCHA มิฉะนั้นผู้ใช้จะเข้าสู่ระบบไม่ได้ ดู [คู่มือ CAPTCHA](https://supabase.com/docs/guides/auth/auth-captcha)
7. ใช้เฉพาะ Project URL และ **publishable/anon key** ในเว็บ ไม่นำ service role key, secret key, รหัสผ่านฐานข้อมูล, SMTP credential หรือ OAuth client secret ไปใส่ในไฟล์ที่เผยแพร่ คีย์สำหรับ client ไม่ใช่สิทธิ์ผู้ดูแล: ความเป็นส่วนตัวขึ้นอยู่กับ RLS ที่ตั้งไว้อย่างถูกต้อง

ข้อมูลและคะแนนในแอปนี้มาจากไคลเอนต์ จึงใช้สำหรับฝึกสอบส่วนตัว ไม่ใช่ผลสอบที่ป้องกันการแก้ไขหรือใช้รับรองอย่างเป็นทางการ แผน Free ไม่มี backup อัตโนมัติและโปรเจกต์อาจถูกพักเมื่อไม่มีการใช้งาน โปรดวางแผนสำรองข้อมูลและตรวจสอบข้อจำกัด/ราคาเมื่อเปิดใช้งานจริง

8. ใส่ Project URL และ publishable/anon key ใน `public/supabase-config.js` ก่อนเผยแพร่ ไฟล์นี้เป็นข้อมูลสาธารณะ ตรวจสอบ URL เว็บให้ตรงกับ redirect ที่อนุญาต

เมื่อใช้ Vercel ให้เพิ่ม URL จริงของเว็บลงใน Supabase Auth ทั้ง Site URL และ Redirect URLs สำหรับลิงก์ยืนยันอีเมล กู้รหัสผ่าน และ Google OAuth หากใช้ Preview deployments ให้ระบุ redirect ที่อนุญาตอย่างจำกัดและเหมาะสม หลีกเลี่ยง wildcard ที่กว้างเกินไป
