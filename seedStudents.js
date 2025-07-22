const mongoose = require('mongoose');
const Student = require('./models/Student');

mongoose.connect('mongodb://localhost:27017/teachers', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log("✅ Connected to MongoDB");
  seedData();
}).catch(err => {
  console.error("❌ MongoDB connection error:", err);
});

const studentData = [
  {
    name: 'Raj',
    batch: 'Batch A',
    email: 'example@gmail.com',
    password: 'password',
    timetable: [
      { day: 'Monday', time: '10:00 - 11:00', subject: 'DBMS', teacher: 'Ahuja' },
      { day: 'Thursday', time: '01:00 - 03:00', subject: 'OS Lab', teacher: 'Raina' },
      { day: 'Friday', time: '01:00 - 02:00', subject: 'OS', teacher: 'Patel' }
    ]
  },
  {
    name: 'Simran',
    batch: 'Batch B',
    email: 'example@gmail.com',
    password: 'password',
    timetable: [
      { day: 'Tuesday', time: '10:00 - 11:00', subject: 'CN', teacher: 'Patel' },
      { day: 'Wednesday', time: '11:00 - 12:00', subject: 'DS', teacher: 'Kapoor' },
      { day: 'Thursday', time: '03:00 - 05:00', subject: 'DS Lab', teacher: 'Kapoor' }
    ]
  },
  {
    name: 'Meet',
    batch: 'Batch C',
    email: 'example@gmail.com',
    password: 'password',
    timetable: [
      { day: 'Tuesday', time: '02:00 - 03:00', subject: 'DBMS', teacher: 'Raina' },
      { day: 'Wednesday', time: '12:00 - 01:00', subject: 'DBMS', teacher: 'Patel' },
      { day: 'Wednesday', time: '11:00 - 01:00', subject: 'DBMS Lab', teacher: 'Ahuja' }
    ]
  }
];


async function seedData() {
  try {
    await Student.deleteMany({});
    await Student.insertMany(studentData);
    console.log("✅ Students seeded successfully");
    mongoose.connection.close();
  } catch (err) {
    console.error("❌ Error seeding students:", err);
  }
}
