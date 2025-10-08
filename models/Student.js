const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  name: String,
  batch: String,
  email: String,
  password: String,
  timetable: [
    {
      day: String,
      time: String,
      subject: String,
      teacher: String
    }
  ]
});

module.exports = mongoose.model('Student', studentSchema);
