require('dotenv').config();
const mongoose = require('mongoose');
const SubstitutionHistory = require('./models/SubstitutionHistory');

mongoose.connect(process.env.MONGO_URI, { dbName: 'teachers' })
  .then(async () => {
    console.log("🧹 Connected to MongoDB. Deleting all substitution history records...");
    const result = await SubstitutionHistory.deleteMany({});
    console.log(`Deleted ${result.deletedCount} history entries.`);
    process.exit();
  })
  .catch(err => {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  });
