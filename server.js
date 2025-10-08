require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const MongoStore = require("connect-mongo");
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const Student = require('./models/Student'); 
const Teacher = require('./models/Teacher');
const Request = require('./models/Request');
const SubstitutionHistory = require('./models/SubstitutionHistory');
console.log(typeof Request.find);
const app = express();
const PORT = process.env.PORT || 4000;

app.set('trust proxy', 1);
const allowedOrigins = [
  'https://project-si3z.onrender.com',
  'http://localhost:3000' // for local testing
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

app.use(bodyParser.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'secret-key',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGO_URI, // from your .env
    ttl: 14 * 24 * 60 * 60 // = 14 days
  }),
  cookie: {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    maxAge: 24 * 60 * 60 * 1000
  }
}));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

mongoose.set('strictQuery', false);

const uri = process.env.MONGO_URI;
console.log("Connecting to:", uri);

if (!uri) {
  console.error("MONGO_URI is undefined. Check your .env file!");
  process.exit(1);
}

mongoose.connect(uri, { dbName: 'teachers' })
.then(async () => {
    console.log("Connected to MongoDB");

    await mongoose.connection.db.admin().ping();

    const result = await Teacher.updateMany(
      { "timetable.day": { $exists: false } },  
      { $set: { "timetable.$[].day": "Monday" } }
    );

    
    app.get('/timetable', async (req, res) => {
      const teacherName = req.session.teacher;
      const selectedDate = req.query.date || new Date().toISOString().split('T')[0];
      const selectedDateObj = new Date(selectedDate);
      const dayName = selectedDateObj.toLocaleDateString('en-US', { weekday: 'long' });

      const teacher = await Teacher.findOne({ name: teacherName });
      if (!teacher) return res.status(404).json({ error: 'Teacher not found' });
      
      const baseSlots = teacher.timetable.filter(slot =>
        slot.day && slot.day.trim().toLowerCase() === dayName.toLowerCase()
      );

      const substitution = await SubstitutionHistory.find({
        substitute: teacherName,
        date: selectedDate
      });

      const substitutionSlots = substitution.map(s => ({
        time: s.time,
        batch: s.batch,
        subject:  s.acceptedSubject || s.subject,
        day: dayName
      }));

      const allGivenAway = await SubstitutionHistory.find({
        teacher: teacherName,
        date: selectedDate
      });

      const givenAway = allGivenAway.filter(g => g.teacher !== g.substitute)

      console.log("Base Slots:", baseSlots);
      console.log("Given Away:", givenAway);

      const updatedBaseSlots = baseSlots.filter(slot => {
        return !givenAway.some(g =>
          g.time.trim().toLowerCase().replace(/\s+/g, '') === slot.time.trim().toLowerCase().replace(/\s+/g, '') &&
          g.batch.trim().toLowerCase() === slot.batch.trim().toLowerCase() &&
          g.subject.trim().toLowerCase() === slot.subject.trim().toLowerCase() &&
          new Date(g.date).toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase() === slot.day.trim().toLowerCase()
        );
      });

      const finalTimetable = [...updatedBaseSlots, ...substitutionSlots];

      res.json({ timetable: finalTimetable });
    });

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });


    app.get('/health', (req, res) => {
      const state = mongoose.connection.readyState;
      res.json({ connected: state === 1 });
    });

    app.post('/login', async (req, res) => {
      const username = req.body.username.trim();
      const password = req.body.password.trim();

      console.log("Login attempt:", { username, password });

      const teacher = await Teacher.findOne({ name: new RegExp(`^${username}$`, 'i') });
      console.log("Fetched teacher:", teacher);

      if (teacher && teacher.password === password) {
        req.session.teacher = teacher.name;
        if (teacher && teacher.password === password) {
          req.session.teacher = teacher.name;
          return res.redirect('/home');  // instead of sending JSON
        }

      }

      console.log("Invalid credentials");
      res.json({ success: false, message: 'Invalid credentials' });
    });

    app.get('/logout', (req, res) => {
      req.session.destroy(() => res.json({ success: true }));
    });

    app.get('/timetable/today', async (req, res) => {
      const teacher = await Teacher.findOne({ name: req.session.teacher });
      if (!teacher) return res.status(403).json({ error: 'Not logged in' });

      const today = new Date().toISOString().split('T')[0];
      const dayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });
      const timetable = teacher.timetable.filter(slot => slot.day === dayName);

      const history = await SubstitutionHistory.find({ substitute: teacher.name, date: today });

      const substitutionSlots = history.map(h => ({
        time: h.time,
        batch: h.batch,
        subject:  s.acceptedSubject || s.subject
      }));

      const filteredSubstitutions = substitutionSlots.filter(h =>
        !timetable.some(t =>
          t.time === h.time &&
          t.batch === h.batch &&
          t.subject === h.subject
        )
      );

      const finalTimetable = [...timetable, ...filteredSubstitutions];

      res.json({ timetable: finalTimetable });
    });

    app.use((req, res, next) => {
      res.header('Access-Control-Allow-Credentials', true);
      res.header('Access-Control-Allow-Origin', req.headers.origin);
      res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
      res.header('Access-Control-Allow-Headers', 'X-Requested-With, X-HTTP-Method-Override, Content-Type, Accept');
      next();
    });

    app.post('/unavailable', async (req, res) => {
        const { date, time, batch, subject, allowAny } = req.body;
        const teacherName = req.session.teacher;
        if (!teacherName) return res.status(403).json({ error: 'Not logged in' });

        const day = new Date(date).toLocaleDateString('en-US', { weekday: 'long' });
        const allTeachers = await Teacher.find({ name: { $ne: teacherName } });

        const substituteTeachers = allTeachers.filter(t => {
            const isBusy = t.timetable.some(slot => slot.day === day && slot.time === time);
            if (isBusy) return false;

            if (allowAny) {
            return t.timetable.some(slot => slot.batch === batch);
            } else {
            return t.timetable.some(slot => slot.subject?.toLowerCase() === subject.toLowerCase());
            }
        });

        if (substituteTeachers.length === 0) {
            return res.json({ success: false, message: "No available teachers found." });
        }

        const emailedTo = [];

        for (const sub of substituteTeachers) {
            const acceptedSubject = allowAny
            ? (sub.timetable.find(slot => slot.batch === batch)?.subject || subject)
            : subject;

            const newRequest = new Request({
            teacher: teacherName,
            substitute: sub.name,
            date,
            time,
            batch,
            subject,
            acceptedSubject,
            status: 'pending',
            requestedBy: teacherName
            });
            await newRequest.save();

            const acceptLink = `http://localhost:4000/respond-email/${sub.name}/${teacherName}/${date}/${time}/${batch}/${subject}/accept`;
            const denyLink = `http://localhost:4000/respond-email/${sub.name}/${teacherName}/${date}/${time}/${batch}/${subject}/deny`;

            await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: sub.email,
            subject: `Substitution Request`,
            html: `<p>${teacherName} requested a substitution on ${date} at ${time} for ${batch} (Subject: ${subject}).</p>
                    <p><a href="${acceptLink}">Accept</a> | <a href="${denyLink}">Decline</a></p>`
            });

            emailedTo.push(sub.name);
        }

        return res.json({ success: true, message: "Substitution requests sent.", emailedTo });
        });


    app.get('/respond-email/:sub/:org/:date/:time/:batch/:subject/:action', async (req, res) => {
        const { sub, org, date, time, batch, subject, action } = req.params;

        const reqDoc = await Request.findOne({
            teacher: org,
            substitute: sub,
            date,
            time,
            batch,
            subject,
            status: 'pending'
        });

        if (!reqDoc) return res.send('Invalid or already processed request.');

        if (action === 'accept') {
            reqDoc.status = `Accepted by ${sub}`;
            await reqDoc.save();

            let acceptedSubject = subject;
            if (reqDoc.allowAny) {
                const substituteTeacher = await Teacher.findOne({ name: sub });
                const timetableEntry = acceptingTeacher.timetable.find(slot =>
                  slot.day === new Date(reqDoc.date).toLocaleDateString('en-US', { weekday: 'long' }) &&
                  slot.time === reqDoc.time &&
                  slot.batch === reqDoc.batch
                );

                acceptedSubject = timetableEntry?.subject || substituteTeacher?.subject || subject;
            }

            await SubstitutionHistory.create({
                teacher: org,
                substitute: sub,
                subject,
                acceptedSubject,
                batch,
                time,
                date,
                acceptedAt: new Date()
            });

            await Request.deleteMany({
                _id: { $ne: reqDoc._id },
                teacher: org,
                date,
                time,
                batch,
                subject,
                status: 'pending'
            });

            const acceptingTeacher = await Teacher.findOne({ name: sub });
            const originalTeacher = await Teacher.findOne({ name: org });
            const students = await Student.find({ batch });

            if (acceptingTeacher?.email) {
                await transporter.sendMail({
                    from: process.env.EMAIL_USER,
                    to: acceptingTeacher.email,
                    subject: 'You accepted a substitution',
                    text: `You will take the ${acceptedSubject} lecture for ${batch} at ${time} on ${date}.`
                });
            }

            if (originalTeacher?.email) {
                await transporter.sendMail({
                    from: process.env.EMAIL_USER,
                    to: originalTeacher.email,
                    subject: 'Substitution Confirmed',
                    text: `${sub} will take your ${subject} lecture for ${batch} at ${time} on ${date}.`
                });
            }

            for (const student of students) {
                if (!student.email) continue;

                await transporter.sendMail({
                    from: process.env.EMAIL_USER,
                    to: student.email,
                    subject: 'Substitution Lecture Alert',
                    text: `Dear ${student.name},\n\nYour lec/lab for ${subject} on ${date} at ${time} is being taken by ${sub}, their subject is ${acceptedSubject}.`
                });
            }

            return res.send('✅ Request accepted and all parties notified.');
        } else {
            reqDoc.status = 'declined';
            await reqDoc.save();
            return res.send('❌ Request declined.');
        }
    });


    app.get('/sent-requests', async (req, res) => {
      const teacherName = req.session.teacher;
      if (!teacherName) return res.status(403).json({ error: 'Not logged in' });

      const sent = await Request.find({ requestedBy: teacherName });
      res.json({ sent });
    });

    app.get('/substitute-requests', async (req, res) => {
      const teacherName = req.session.teacher;
      if (!teacherName) return res.status(403).json({ error: 'Not logged in' });

      const requests = await Request.find({ substitute: teacherName, status: 'pending' });
      res.json({ requests });
    });


    app.post('/respond', async (req, res) => {
        const teacherName = req.session.teacher;
        const { requestId, agree } = req.body;
        if (!teacherName) return res.status(403).json({ error: 'Not logged in' });

        const reqDoc = await Request.findById(requestId);
        if (!reqDoc || reqDoc.substitute !== teacherName) {
            return res.status(400).json({ error: 'Invalid request' });
        }

        if (agree) {
            reqDoc.status = `Accepted by ${teacherName}`;
            await reqDoc.save();

            const acceptingTeacher = await Teacher.findOne({ name: teacherName });
            const originalTeacher = await Teacher.findOne({ name: reqDoc.teacher });
            const students = await Student.find({ batch: reqDoc.batch });

            let acceptedSubject = reqDoc.subject;
            if (reqDoc.allowAny) {
                const timetableEntry = acceptingTeacher.timetable.find(slot =>
                  slot.day === new Date(reqDoc.date).toLocaleDateString('en-US', { weekday: 'long' }) &&
                  slot.time === reqDoc.time &&
                  slot.batch === reqDoc.batch
                );

                acceptedSubject = timetableEntry?.subject || acceptingTeacher.subject;
            }

            await SubstitutionHistory.create({
                teacher: reqDoc.teacher,
                substitute: teacherName,
                subject: reqDoc.subject,
                acceptedSubject,
                batch: reqDoc.batch,
                time: reqDoc.time,
                date: reqDoc.date,
                acceptedAt: new Date()
            });

            await Request.deleteMany({
                _id: { $ne: reqDoc._id },
                teacher: reqDoc.teacher,
                date: reqDoc.date,
                time: reqDoc.time,
                batch: reqDoc.batch,
                subject: reqDoc.subject,
                status: 'pending'
            });

            await transporter.sendMail({
                from: process.env.EMAIL_USER,
                to: acceptingTeacher.email,
                subject: `You accepted a substitution`,
                text: `You will take a ${acceptedSubject} lecture for ${reqDoc.batch} at ${reqDoc.time} on ${reqDoc.date}.`
            });

            await transporter.sendMail({
                from: process.env.EMAIL_USER,
                to: originalTeacher.email,
                subject: `Substitution Confirmed`,
                text: `${teacherName} will take your ${reqDoc.subject} lecture for ${reqDoc.batch} at ${reqDoc.time} on ${reqDoc.date}.`
            });

            for (const student of students) {
                if (!student.email) continue;

                await transporter.sendMail({
                    from: process.env.EMAIL_USER,
                    to: student.email,
                    subject: 'Substitution Lecture Alert',
                    text: `Dear ${student.name},\n\nYour lecture/lab for ${reqDoc.subject} on ${reqDoc.date} at ${reqDoc.time} will be taken by ${teacherName}, their subject is ${acceptedSubject}.`
                });
            }

            return res.json({ success: true, message: 'Request accepted.' });
        } else {
            reqDoc.status = 'declined';
            await reqDoc.save();
            return res.json({ success: true, message: 'Request declined.' });
        }
    });


    app.get('/substitution-history', async (req, res) => {
      const teacherName = req.session.teacher;
      if (!teacherName) return res.status(403).json({ error: 'Not logged in' });

      const history = await SubstitutionHistory.find({
        $or: [{ teacher: teacherName }, { substitute: teacherName }]
      }).sort({ acceptedAt: -1 });

      res.json({ history });
    });

    app.get('/', (req, res) => {
      res.render('show');
    });

    app.get('/home', async (req, res) => {
      const teacher = await Teacher.findOne({ name: req.session.teacher });
      if (!teacher) return res.redirect('/');

      res.render('home', {
        name: teacher.name,
        email: teacher.email || `${teacher.name.toLowerCase()}@somaiya.edu`
      });
    });

    app.get('/substitution', (req, res) => {
      if (!req.session.teacher) return res.redirect('/');
      res.render('index', { teacherName: req.session.teacher });
    });


    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });

    })
    .catch((err) => {
      console.error("MongoDB connection error:", err);
      process.exit(1);
    });