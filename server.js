require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const MongoStore = require("connect-mongo");
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
const sendEmail = require('./utils/sendEmail');
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
  'http://127.0.0.1:5500',     
  'http://localhost:3000' // for local testing
];

app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true
}));



app.use(bodyParser.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'secret-key',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGO_URI,
    ttl: 14 * 24 * 60 * 60
  }),
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
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

    // Add async handler wrapper
    const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

app.get('/timetable', asyncHandler(async (req, res) => {
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
  finalTimetable.sort((a, b) => a.time.localeCompare(b.time)); // Sort by time
  res.json({ timetable: finalTimetable });
}));

app.get('/api/timetable', asyncHandler(async (req, res) => {
  if (!req.session.teacher) {
    return res.status(401).json({ message: 'Not logged in' });
  }

  const teacher = await Teacher.findOne({ name: req.session.teacher });
  if (!teacher) return res.status(404).json({ error: 'Teacher not found' });
  
  // Get today's day name
  const today = new Date();
  const dayName = today.toLocaleDateString('en-US', { weekday: 'long' });
  const todayDate = today.toISOString().split('T')[0];
  
  // Filter timetable for today only
  const baseTimetable = teacher.timetable.filter(slot => 
    slot.day && slot.day.trim().toLowerCase() === dayName.toLowerCase()
  );

  // Get substitutions for today
  const substitutions = await SubstitutionHistory.find({
    substitute: teacher.name,
    date: todayDate
  });

  const substitutionSlots = substitutions.map(s => ({
    time: s.time,
    batch: s.batch,
    subject: s.acceptedSubject || s.subject,
    day: dayName
  }));

  // Remove slots given away
  const givenAway = await SubstitutionHistory.find({
    teacher: teacher.name,
    date: todayDate
  });

  const finalTimetable = baseTimetable.filter(slot => 
    !givenAway.some(g => 
      g.time === slot.time && 
      g.batch === slot.batch && 
      g.subject === slot.subject
    )
  );

  // Combine and sort
  const allSlots = [...finalTimetable, ...substitutionSlots];
  allSlots.sort((a, b) => a.time.localeCompare(b.time));

  res.json({ timetable: allSlots });
}));

app.get('/substitution-history', asyncHandler(async (req, res) => {
  const teacherName = req.session.teacher;
  if (!teacherName) return res.status(403).json({ error: 'Not logged in' });

  const now = new Date();
  const currentDate = now.toISOString().split('T')[0];
  const currentTime = now.toTimeString().slice(0, 5); // HH:MM format

  // Get all history
  const allHistory = await SubstitutionHistory.find({
    $or: [{ teacher: teacherName }, { substitute: teacherName }]
  }).sort({ acceptedAt: -1 });

  // Filter out past entries
  const history = allHistory.filter(h => {
    const historyDate = new Date(h.date).toISOString().split('T')[0];
    
    // Keep if future date
    if (historyDate > currentDate) return true;
    
    // Keep if today but time hasn't passed
    if (historyDate === currentDate) {
      const historyTime = h.time.slice(0, 5); // Get HH:MM
      return historyTime >= currentTime;
    }
    
    // Remove past entries
    return false;
  });

  res.json({ history });
}));

app.get('/substitute-requests', asyncHandler(async (req, res) => {
  const teacherName = req.session.teacher;
  if (!teacherName) return res.status(403).json({ error: 'Not logged in' });

  const now = new Date();
  const currentDate = now.toISOString().split('T')[0];
  const currentTime = now.toTimeString().slice(0, 5);

  // Get pending requests
  const allRequests = await Request.find({ 
    substitute: teacherName, 
    status: 'pending' 
  });

  // Filter out past requests
  const requests = allRequests.filter(r => {
    const reqDate = new Date(r.date).toISOString().split('T')[0];
    
    if (reqDate > currentDate) return true;
    
    if (reqDate === currentDate) {
      const reqTime = r.time.slice(0, 5);
      return reqTime >= currentTime;
    }
    
    return false;
  });

  res.json({ requests });
}));

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

async function notifyEmail(to, subject, html, fallbackText = '') {
  if (!to) return { ok: false, error: 'Missing recipient email' };

  try {
    await sendEmail(to, subject, html);
    return { ok: true };
  } catch (err) {
    console.error(`sendEmail failed for ${to}: ${err.message}`);
    try {
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to,
        subject,
        html,
        text: fallbackText || html.replace(/<[^>]*>/g, ' ')
      });
      return { ok: true };
    } catch (fallbackErr) {
      console.error(`Fallback email failed for ${to}: ${fallbackErr.message}`);
      return { ok: false, error: fallbackErr.message };
    }
  }
}

app.get('/health', (req, res) => {
  const state = mongoose.connection.readyState;
  res.json({ connected: state === 1 });
});

app.post('/login', async (req, res) => {
  const username = req.body.username.trim();
  const password = req.body.password.trim();

  const teacher = await Teacher.findOne({ name: new RegExp(`^${username}$`, 'i') });
  console.log("Login attempt:", { username });

  if (teacher && teacher.password === password) {
    req.session.teacher = teacher.name;
    return res.json({ success: true });
  }
  
  return res.json({ success: false, message: 'Invalid credentials' });
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
    subject: h.acceptedSubject || h.subject  // Fixed s to h
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

app.post('/unavailable', asyncHandler(async (req, res) => {
    const { date, time, batch, subject, allowAny } = req.body;
    const teacherName = req.session.teacher;
    
    // Validate inputs
    if (!date || !time || !batch || !subject) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    
    if (!teacherName) return res.status(403).json({ error: 'Not logged in' });

    const existingRequest = await Request.findOne({
        teacher: teacherName,
        date,
        time,
        batch,
        subject,
        status: 'pending'
    });

    if (existingRequest) {
        return res.json({ 
            success: false, 
            message: "You have already requested substitution for this lecture/lab and it's pending." 
        });
    }

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
    const failedEmails = [];

    for (const sub of substituteTeachers) {
        try {
            const acceptedSubject = allowAny
                ? (sub.timetable.find(slot => slot.batch === batch)?.subject || subject)
                : subject;

            const newRequest = await Request.create({
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

            const baseUrl = process.env.BASE_URL;
            const acceptLink = `${baseUrl}/respond-email/${encodeURIComponent(sub.name)}/${encodeURIComponent(teacherName)}/${date}/${encodeURIComponent(time)}/${encodeURIComponent(batch)}/${encodeURIComponent(subject)}/accept`;
            const denyLink = `${baseUrl}/respond-email/${encodeURIComponent(sub.name)}/${encodeURIComponent(teacherName)}/${date}/${encodeURIComponent(time)}/${encodeURIComponent(batch)}/${encodeURIComponent(subject)}/deny`;

            const htmlBody = `
                <h2>Substitution Request</h2>
                <p>${teacherName} requested a substitution on ${date} at ${time} for ${batch}</p>
                <p><b>Subject:</b> ${subject}</p>
                <p><a href="${acceptLink}" style="background:#4CAF50;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;display:inline-block;margin:10px 5px">Accept</a> 
                <a href="${denyLink}" style="background:#f44336;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;display:inline-block;margin:10px 5px">Decline</a></p>
            `;

            const sendResult = await notifyEmail(
              sub.email,
              'Substitution Request',
              htmlBody
            );

            if (!sendResult.ok) {
              failedEmails.push({ teacher: sub.name, error: sendResult.error });
              continue;
            }

            emailedTo.push(sub.name);
        } catch (err) {
            console.error(`Failed to process request for ${sub.name}:`, err);
            failedEmails.push({ teacher: sub.name, error: err.message });
        }
    }

    let message = "Substitution requests sent.";
    if (failedEmails.length > 0) {
        message += ` However, failed to send emails to: ${failedEmails.map(f => f.teacher).join(', ')}`;
    }

    return res.json({ 
        success: true, 
        message, 
        emailedTo,
        failedEmails 
    });
}));

// Unified substitution response endpoint
app.post('/substitution/respond', asyncHandler(async (req, res) => {
    const teacherName = req.session.teacher;
    const { requestId, agree } = req.body;

    if (!teacherName) return res.status(403).json({ error: 'Not logged in' });
    if (!requestId) return res.status(400).json({ error: 'Request ID is required' });

    const reqDoc = await Request.findById(requestId);
    if (!reqDoc || reqDoc.substitute !== teacherName) {
        return res.status(400).json({ error: 'Invalid request' });
    }

    // Check if this slot is already accepted
    const existingAccepted = await SubstitutionHistory.findOne({
        teacher: reqDoc.teacher,
        date: reqDoc.date,
        time: reqDoc.time,
        batch: reqDoc.batch,
        subject: reqDoc.subject
    });

    if (existingAccepted) {
        return res.json({
            success: false,
            message: `This request has already been accepted by ${existingAccepted.substitute}.`
        });
    }

    if (!agree) {
        reqDoc.status = 'declined';
        await reqDoc.save();
        return res.json({ success: true, message: 'Request declined.' });
    }

    // Accept the request
    reqDoc.status = `Accepted by ${teacherName}`;
    await reqDoc.save();

    const acceptingTeacher = await Teacher.findOne({ name: teacherName });
    const originalTeacher = await Teacher.findOne({ name: reqDoc.teacher });
    const students = await Student.find({ batch: reqDoc.batch });

    // Determine actual subject if allowAny is true
    let acceptedSubject = reqDoc.subject;
    if (reqDoc.allowAny) {
        const timetableEntry = acceptingTeacher.timetable.find(slot =>
            slot.day === new Date(reqDoc.date).toLocaleDateString('en-US', { weekday: 'long' }) &&
            slot.time === reqDoc.time &&
            slot.batch === reqDoc.batch
        );
        acceptedSubject = timetableEntry?.subject || acceptingTeacher.subject;
    }

    // Save to SubstitutionHistory
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

    // Delete other pending requests for this slot
    await Request.deleteMany({
        _id: { $ne: reqDoc._id },
        teacher: reqDoc.teacher,
        date: reqDoc.date,
        time: reqDoc.time,
        batch: reqDoc.batch,
        subject: reqDoc.subject,
        status: 'pending'
    });

    // Notify accepting teacher (YOU accepted)
    if (acceptingTeacher?.email) {
        const result = await notifyEmail(
            acceptingTeacher.email,
            'You Accepted a Substitution Request',
            `
            <h2>Substitution Accepted</h2>
            <p>You have successfully accepted the substitution request from ${reqDoc.teacher}.</p>
            <p><b>Date:</b> ${reqDoc.date}</p>
            <p><b>Time:</b> ${reqDoc.time}</p>
            <p><b>Batch:</b> ${reqDoc.batch}</p>
            <p><b>Original Subject:</b> ${reqDoc.subject}</p>
            <p><b>You will teach:</b> ${acceptedSubject}</p>
            <p>Please be present on time. Thank you!</p>
            `
        );
        if (!result.ok) console.error(`Could not notify accepting teacher ${acceptingTeacher.name}: ${result.error}`);
    }

    // Notify original teacher (Your request was accepted)
    if (originalTeacher?.email) {
        const result = await notifyEmail(
            originalTeacher.email,
            'Substitution Request Accepted',
            `
            <h2>Substitution Confirmed</h2>
            <p>${teacherName} has accepted your substitution request.</p>
            <p><b>Date:</b> ${reqDoc.date}</p>
            <p><b>Time:</b> ${reqDoc.time}</p>
            <p><b>Batch:</b> ${reqDoc.batch}</p>
            <p><b>Subject:</b> ${reqDoc.subject}</p>
            <p>Your class will be covered. Thank you!</p>
            `
        );
        if (!result.ok) console.error(`Could not notify original teacher ${originalTeacher.name}: ${result.error}`);
    }

    // Notify students
    for (const student of students) {
        if (!student.email) continue;
        const result = await notifyEmail(
            student.email,
            'Lecture Update - Change in Faculty',
            `
            <h2>Lecture Update</h2>
            <p>Dear ${student.name},</p>
            <p>There has been a change in your lecture schedule:</p>
            <p><b>Date:</b> ${reqDoc.date}</p>
            <p><b>Time:</b> ${reqDoc.time}</p>
            <p><b>Batch:</b> ${reqDoc.batch}</p>
            <p><b>Subject:</b> ${acceptedSubject}</p>
            <p><b>Faculty:</b> ${teacherName} (substitute for ${reqDoc.teacher})</p>
            <p>Please attend the class as scheduled.</p>
            `
        );
        if (!result.ok) console.error(`Could not notify student ${student.name}: ${result.error}`);
    }

    return res.json({ success: true, message: 'Request accepted and notifications sent to all parties.' });
}));

app.get('/respond-email/:sub/:org/:date/:time/:batch/:subject/:action', asyncHandler(async (req, res) => {
    const { sub, org, date, time, batch, subject, action } = req.params;

    if (action !== 'accept' && action !== 'decline') {
        return res.send('Invalid action');
    }

    const reqDoc = await Request.findOne({
        teacher: org,
        substitute: sub,
        date,
        time,
        batch,
        subject,
        status: 'pending'
    });

    if (!reqDoc) {
        return res.send('Invalid or already processed request.');
    }

    // Create temporary session for email click
    req.session.teacher = sub;
    
    // Call unified endpoint logic
    const result = await Request.findById(reqDoc._id);
    
    // Redirect to a confirmation page or send response
    const agree = action === 'accept';
    
    // Manually trigger the same logic
    if (agree) {
        const existingAccepted = await SubstitutionHistory.findOne({
            teacher: org, date, time, batch, subject
        });

        if (existingAccepted) {
            return res.send(` This request was already accepted by ${existingAccepted.substitute}`);
        }

        // Process acceptance using same logic
        reqDoc.status = `Accepted by ${sub}`;
        await reqDoc.save();

        let acceptedSubject = subject;
        if (reqDoc.allowAny) {
            const substituteTeacher = await Teacher.findOne({ name: sub });
            const timetableEntry = substituteTeacher?.timetable.find(slot =>
                slot.day === new Date(date).toLocaleDateString('en-US', { weekday: 'long' }) &&
                slot.time === time &&
                slot.batch === batch
            );
            acceptedSubject = timetableEntry?.subject || substituteTeacher?.subject || subject;
        }

        await SubstitutionHistory.create({
            teacher: org, substitute: sub, subject, acceptedSubject,
            batch, time, date, acceptedAt: new Date()
        });

        await Request.deleteMany({
            _id: { $ne: reqDoc._id },
            teacher: org, date, time, batch, subject,
            status: 'pending'
        });

        // Send notifications
        const originalTeacher = await Teacher.findOne({ name: org });
        const students = await Student.find({ batch });

        if (originalTeacher?.email) {
            const result = await notifyEmail(
              originalTeacher.email,
              'Substitution Confirmed',
              `<h2>Substitution Confirmed</h2>
               <p>${sub} will take your ${subject} lecture for ${batch} at ${time} on ${date}.</p>`
            );
            if (!result.ok) console.error(`Could not notify original teacher ${originalTeacher.name}: ${result.error}`);
        }

        for (const student of students) {
            if (!student.email) continue;
            const result = await notifyEmail(
              student.email,
              'Lecture Update',
              `<h2>Lecture Update</h2>
               <p>Dear ${student.name},</p>
               <p>Your ${subject} lecture on ${date} at ${time} will be taken by ${sub}.</p>`
            );
            if (!result.ok) console.error(`Could not notify student ${student.name}: ${result.error}`);
        }

        return res.send('Request accepted and all parties notified.');
    } else {
        reqDoc.status = 'declined';
        await reqDoc.save();
        return res.send('Request declined.');
    }
}));

app.get('/sent-requests', asyncHandler(async (req, res) => {
  const teacherName = req.session.teacher;
  if (!teacherName) return res.status(403).json({ error: 'Not logged in' });

  const sent = await Request.find({ requestedBy: teacherName });
  res.json({ sent });
}));

app.get('/substitute-requests', asyncHandler(async (req, res) => {
  const teacherName = req.session.teacher;
  if (!teacherName) return res.status(403).json({ error: 'Not logged in' });

  const now = new Date();
  const currentDate = now.toISOString().split('T')[0];
  const currentTime = now.toTimeString().slice(0, 5);

  // Get pending requests
  const allRequests = await Request.find({ 
    substitute: teacherName, 
    status: 'pending' 
  });

  // Filter out past requests
  const requests = allRequests.filter(r => {
    const reqDate = new Date(r.date).toISOString().split('T')[0];
    
    if (reqDate > currentDate) return true;
    
    if (reqDate === currentDate) {
      const reqTime = r.time.slice(0, 5);
      return reqTime >= currentTime;
    }
    
    return false;
  });

  res.json({ requests });
}));

// Add missing root route
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

// Error handler middleware (must be last)
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ 
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'production' ? 'Something went wrong' : err.message
    });
});

// Start server INSIDE mongoose .then()
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`✅ Connected to MongoDB`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
})
})
.catch((err) => {
    console.error("MongoDB connection error:", err);
    process.exit(1);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully...');
    mongoose.connection.close(() => {
        console.log('MongoDB connection closed');
        process.exit(0);
    });
});