const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 4000;

app.use(cors({ origin: 'http://localhost:3000', credentials: true }));
app.use(bodyParser.json());
app.use(session({ secret: 'secret-key', resave: false, saveUninitialized: true }));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

const teacherData = {
  Ahuja: [
    { time: '10:00 - 11:00', batch: 'Batch A', subject: 'DBMS' },
    { time: '11:00 - 12:00', batch: 'Batch C', subject: 'OS' }
  ],
  Raina: [
    { time: '11:00 - 12:00', batch: 'Batch A', subject: 'OS' }
  ],
  Patel: [
    { time: '10:00 - 11:00', batch: 'Batch B', subject: 'CN' },
    { time: '12:00 - 01:00', batch: 'Batch C', subject: 'DBMS' },
    { time: '01:00 - 02:00', batch: 'Batch A', subject: 'OS' }
  ],
  Kapoor: [
    { time: '11:00 - 12:00', batch: 'Batch B', subject: 'DS' }
  ]
};

let substituteRequests = [];
let requestIdCounter = 0;

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (teacherData[username] && password === 'password') {
    req.session.teacher = username;
    return res.json({ success: true, teacher: username });
  }
  res.json({ success: false, message: 'Invalid credentials' });
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

app.get('/timetable', (req, res) => {
  const teacher = req.session.teacher;
  if (teacher && teacherData[teacher]) {
    return res.json({ timetable: teacherData[teacher] });
  }
  res.status(403).json({ error: 'Not logged in' });
});

app.post('/unavailable', (req, res) => {
  const teacher = req.session.teacher;
  const { date, time, batch, subject } = req.body;
  if (!teacher) return res.status(403).json({ error: 'Not logged in' });

  const freeTeachers = Object.keys(teacherData).filter(other => {
    if (other === teacher) return false;
    const busy = teacherData[other].some(slot => slot.time === time);
    const teachesSubject = teacherData[other].some(slot => slot.subject === subject);
    return !busy && teachesSubject;
  });

  if (freeTeachers.length === 0) {
    return res.json({ success: false, message: 'No matching free teachers at this time' });
  }

  freeTeachers.forEach(substitute => {
    substituteRequests.push({
      id: requestIdCounter++,
      teacher,
      date,
      time,
      batch,
      subject,
      substitute,
      status: 'pending'
    });
  });

  res.json({ success: true, message: 'Requests sent to available teachers.', sentTo: freeTeachers });
});



app.get('/substitute-requests', (req, res) => {
  const teacher = req.session.teacher;
  if (!teacher) return res.status(403).json({ error: 'Not logged in' });

  const requests = substituteRequests.filter(r => r.substitute === teacher);
  res.json({ requests });
});


app.post('/respond', (req, res) => {
  const teacher = req.session.teacher;
  const { requestId, agree } = req.body;

  if (!teacher) return res.status(403).json({ error: 'Not logged in' });

  const request = substituteRequests.find(r => r.id === requestId);
  if (!request || request.substitute !== teacher) {
    return res.status(400).json({ error: 'Invalid request' });
  }

  if (agree) {
    request.status = `Accepted by ${teacher}`;

    substituteRequests = substituteRequests.filter(r => {
      const same = r.date === request.date &&
                   r.time === request.time &&
                   r.batch === request.batch &&
                   r.subject === request.subject &&
                   r.teacher === request.teacher;

      return !same || r.id === request.id; 
    });

    return res.json({ success: true, message: 'You have accepted the request.' });
  } else {
    request.status = 'declined';
    return res.json({ success: true, message: 'You have declined the request.' });
  }
});

app.get('/sent-requests', (req, res) => {
  const teacher = req.session.teacher;
  if (!teacher) return res.status(403).json({ error: 'Not logged in' });

  const sent = substituteRequests
    .filter(r => r.teacher === teacher)
    .map(r => ({
      date: r.date,
      time: r.time,
      batch: r.batch,
      subject: r.subject,
      status: r.status
    }));

  res.json({ sent });
});

app.get('/', (req, res) => {
  res.render('1', { title: 'Timetable Page', message: 'Welcome!' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
