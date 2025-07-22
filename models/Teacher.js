const mongoose = require('mongoose');

const timetableSchema = new mongoose.Schema({
  day: String,
  time: String,
  batch: String,
  subject: String
});

const teacherSchema = new mongoose.Schema({
  name: { type: String, unique: true },
  email: String,
  password: String, 
  timetable: [timetableSchema]
});

module.exports = mongoose.model('Teacher', teacherSchema);