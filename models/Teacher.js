const mongoose = require('mongoose');

const timetableSchema = new mongoose.Schema({
  day: String,
  time: String,
  subject: String,
  batch: String,
  teacher: String
});

const teacherSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: String,
  password: String,
  timetable: [timetableSchema]
});

module.exports = mongoose.model('Teacher', teacherSchema);
