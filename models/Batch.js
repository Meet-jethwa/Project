const mongoose = require('mongoose');
const batchSchema = new mongoose.Schema({
  className: String,
  name: String,
  timetable: [
    {
      day: String,
      time: String,
      subject: String,
      teacher: String,
      batch: String
    }
  ]
});
module.exports = mongoose.model('Batch', batchSchema);
