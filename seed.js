require('dotenv').config();
const mongoose = require('mongoose');
const Teacher = require('./models/Teacher');

const uri = process.env.MONGO_URI;
console.log("✅ Connecting to:", uri);

if (!uri) {
  console.error("❌ MONGO_URI is undefined. Check .env");
  process.exit(1);
}

const teacherData = {
  Ahuja: {
    email: 'unknown1569566@gmail.com',
    password: 'password',
    timetable: [
      { day: 'Monday', time: '10:00 - 11:00', batch: 'Batch A', subject: 'DBMS' },
      { day: 'Monday', time: '12:00 - 01:00', batch: 'Batch C', subject: 'DBMS' },
      { day: 'Monday', time: '02:00 - 04:00', batch: 'Batch A', subject: 'DBMS Lab' },
      { day: 'Tuesday', time: '09:00 - 10:00', batch: 'Batch B', subject: 'DBMS' },
      { day: 'Wednesday', time: '10:00 - 11:00', batch: 'Batch A', subject: 'DBMS' },
      { day: 'Thursday', time: '11:00 - 12:00', batch: 'Batch A', subject: 'DBMS' },
      { day: 'Friday', time: '02:00 - 04:00', batch: 'All', subject: 'Project Lab' }
    ]
  },
  Raina: {
    email: 'unknown1569566@gmail.com',
    password: 'password',
    timetable: [
      { day: 'Monday', time: '11:00 - 12:00', batch: 'Batch A', subject: 'WPL' },
      { day: 'Monday', time: '02:00 - 03:00', batch: 'Batch C', subject: 'DS' },
      { day: 'Tuesday', time: '02:00 - 04:00', batch: 'Batch B', subject: 'WPL Lab' },
      { day: 'Wednesday', time: '09:00 - 10:00', batch: 'Batch A', subject: 'WPL' },
      { day: 'Thursday', time: '11:00 - 12:00', batch: 'Batch B', subject: 'DS' },
      { day: 'Friday', time: '10:00 - 11:00', batch: 'Batch A', subject: 'WPL' }
    ]
  },
  Patel: {
    email: 'unknown1569566@gmail.com',
    password: 'password',
    timetable: [
      { day: 'Monday', time: '10:00 - 11:00', batch: 'Batch B', subject: 'WPL' },
      { day: 'Monday', time: '12:00 - 01:00', batch: 'Batch C', subject: 'DBMS' },
      { day: 'Tuesday', time: '01:00 - 02:00', batch: 'Batch A', subject: 'WPL' },
      { day: 'Wednesday', time: '02:00 - 04:00', batch: 'Batch C', subject: 'WPL Lab' },
      { day: 'Thursday', time: '10:00 - 11:00', batch: 'Batch C', subject: 'WPL' },
      { day: 'Friday', time: '01:00 - 02:00', batch: 'Batch A', subject: 'WPL' }
    ]
  },
  Khushi: {
    email: 'khushijethwa03@gmail.com',
    password: 'password',
    timetable: [
      { day: 'Monday', time: '11:00 - 12:00', batch: 'Batch B', subject: 'DS' },
      { day: 'Tuesday', time: '02:00 - 03:00', batch: 'Batch A', subject: 'DS' },
      { day: 'Tuesday', time: '03:00 - 04:00', batch: 'Batch C', subject: 'DS' },
      { day: 'Wednesday', time: '10:00 - 11:00', batch: 'Batch B', subject: 'DS' },
      { day: 'Thursday', time: '02:00 - 04:00', batch: 'Batch A', subject: 'DS Lab' },
      { day: 'Friday', time: '11:00 - 12:00', batch: 'Batch C', subject: 'DS' }
    ]
  }
};

mongoose.connect(uri, { dbName: 'teachers' }).then(async () => {
  await Teacher.deleteMany({});
  const teachers = Object.entries(teacherData).map(([name, { email, password, timetable }]) => ({
    name,
    email,
    password,
    timetable
  }));

  const inserted = await Teacher.insertMany(teachers);
  console.log("✅ Seeded teachers:", inserted.map(t => t.name).join(', '));
  mongoose.disconnect();
}).catch((err) => {
  console.error("❌ MongoDB connection error:", err);
});
